# Convx Discord Assistant

CONVY is a Discord conversational assistant running on a Cloudflare Worker with a persistent Discord Gateway Durable Object. It responds to bot mentions and replies to its own messages. It uses a bounded rolling context buffer, approved D1 knowledge, optional creator-saved long-term memories, web search, and eligible free community text models. Ordinary replies are model-generated; there is no fixed canned roast list.

## Conversation and memory

- The Gateway keeps the latest **24 non-empty text messages per channel** in Durable Object storage, including CONVY's own replies. The model receives up to the latest 14 messages when answering. This avoids spending D1 row writes on every chat message and preserves immediate context when the D1 write quota is reached.
- D1 stores approved knowledge, optional owner-approved long-term memories, and best-effort message history. The live Pollinations model catalog, hourly cache, and lightweight local model-performance statistics live in Durable Object storage. Catalog refreshes and per-attempt model metrics do not write D1. D1's free-tier row-write quota is separate from Durable Object storage and resets at midnight UTC. If D1 is over quota, D1-backed commands and durable long-term memories may fail until reset, but rolling context, pause control, and model-catalog caching do not depend on D1.
- CONVY only receives messages Discord delivers to channels the bot can access. Context may contain other users' text from the same channel, so tell server members that recent channel context is used.
- Use `!remember fact` for a stable memory that should survive beyond the rolling channel buffer, `!memory` to list saved memories, and `!forget ID` to delete one. These are creator-only.
- The model receives a limited relevant transcript and any approved knowledge/memories. Web search result snippets are sent to the selected third-party model when a search is used. Treat Discord text and web results as untrusted source data, not instructions.

## Discord setup

1. Open https://discord.com/developers/applications and create an application.
2. Open **Bot**, create the bot, enable **Message Content Intent**, and store the bot token privately as a Cloudflare Worker secret.
3. Under **OAuth2 → URL Generator**, select `bot` and `applications.commands`. Grant View Channel and Read Message History in channels the bot should monitor, Send Messages in ordinary text/announcement channels, and Send Messages in Threads for thread replies, including forum/media posts. Then invite it to Convx.
4. Set the bot ID, guild ID, target channel ID, admin role IDs, and your own Discord user ID in the Worker variables. Enable Developer Mode in Discord to copy IDs.

## What CONVY can and cannot do

When asked about her capabilities, CONVY should describe supported actions accurately rather than improvise tools. She can chat using recent text from channels the bot can access, search the web when enabled and authorized, answer Convx app setup questions using the official public repository and source links, and help draft Convx issue reports or comments. For GitHub reports, she checks likely open duplicates, shows a preview, and requires explicit confirmation before posting. Only configured admins can create new issues; members can propose comments on existing issues. GitHub actions require the configured token and permissions. CONVY cannot directly change Convx app settings, edit the app source code, execute arbitrary actions, or inspect inaccessible channels/DMs. If a feature or permission is unavailable, she must say so plainly.

## GitHub issue creation and community updates for Convx

CONVY supports natural-language issue conversations in ordinary Discord messages; no bang command is needed. Mention CONVY or reply to her when reporting a Convx bug or asking to create an issue. She searches the `cosmictaserdev-creator/Convx` repository for similar open issues first. When a match exists, she recommends adding new evidence as a comment instead of opening another ticket. Users can say `add this info to #123` to attach the report they already supplied, or `comment on #123: new details` to prepare a comment. She previews each comment and asks for explicit confirmation before posting.

To reduce repo spam, **any server member can propose a comment on an existing issue, but only configured admins can create a new issue**. A new issue is blocked if a likely duplicate appears during the final pre-submit check, unless an admin explicitly chooses `create a separate issue anyway` after seeing the matches and then confirms creation. Exact duplicate comments are detected before posting. Comments are limited to four per user per hour and 20 per repository per hour; new issues are limited to two per admin per hour and three per repository per hour. Drafts expire after 30 minutes. Each comment uses the current requester's display name and Discord user ID, not the original issue reporter's identity.

### Required setup

1. Add `GITHUB_ISSUES_TOKEN` as a **Cloudflare Worker secret**. Use a fine-grained GitHub token with **Issues: read and write** on `cosmictaserdev-creator/Convx` and repository metadata access. The token owner must already have permission to create issues and comment in that repository. Never put this token in Discord, source code, `wrangler.toml`, or a commit.
2. Configure `ADMIN_USER_IDS` and/or `ADMIN_ROLE_IDS` for the people allowed to create new issues. Regular members can still add corroborating details to an existing issue after reviewing and confirming the comment.
3. Mention CONVY or reply to her with a report. She will show matching issues first. If none match, a configured admin must approve a new issue. Nothing is written to GitHub without an explicit confirmation.

If duplicate searching fails, CONVY fails closed and does not create or comment on an issue. The Worker health endpoint reports whether `GITHUB_ISSUES_TOKEN` is configured without revealing it. The optional Discord HTTP-interaction endpoint is separate; natural-language issue conversations use the existing Discord Gateway handler and do not need `DISCORD_PUBLIC_KEY` or a slash command.

## Model providers and routing

### Primary: OpenRouter

The default primary provider is OpenRouter with `liquid/lfm-2.5-2.6b:free`. Configure the model through `OPENROUTER_MODEL` and provider priority through `PRIMARY_MODEL_PROVIDER`; both are non-secret Worker variables in `wrangler.toml`. Before sending a request, the Worker verifies the configured model's ID, text modality, and explicit zero prompt/completion pricing against OpenRouter's model metadata. Successful checks are cached for 15 minutes in Durable Object storage, not D1. Model IDs that are not a `:free` variant or whose current prices cannot be confirmed as zero are rejected. The automatic OpenRouter route intentionally attempts only the configured LFM model, never other OpenRouter models.

Store the OpenRouter key only as the Cloudflare Worker secret `OPENROUTER_API_KEY`. Never put it in source code, `wrangler.toml`, GitHub commits, or chat. The code retries transient OpenRouter timeouts, rate limits, and provider errors once, but it never tries a second OpenRouter model. It uses only the configured `liquid/lfm-2.5-2.6b:free` model on OpenRouter; if LFM fails or the OpenRouter key is missing, automatic text requests proceed directly to the ordered Groq fallback models: `qwen/qwen3.8-27b` with task-adaptive reasoning (none for casual chat, low/medium for routine multi-step tasks, and high for explicitly difficult tasks), `openai/gpt-oss-120b` with `reasoning_effort: low`, and `openai/gpt-oss-20b` with `reasoning_effort: low`. The configured Mistral model (`ministral-14b-2512` by default) comes next when `MISTRAL_API_KEY` is configured. Pollinations is last and still requires the live catalog to verify explicit zero input/output text-token prices. Groq fallback calls use their OpenAI-compatible API. They fail forward on errors and rate limits rather than waiting through a long retry. `/health` and `!provider` show secret presence and pricing-verification state without revealing key values. Explicit `!model 1-15` selections continue to use the existing Pollinations models; `!model auto` restores OpenRouter as the default text primary. The configured LFM model is text-only, so image requests continue to the explicit Pollinations vision-capable set.

Prompt design: LFM receives compact, direct instructions and only non-empty context sections, avoiding long persona lore. It follows Liquid’s published generation settings (`temperature: 0.1`, `top_k: 50`, `repetition_penalty: 1.1`), with a small creativity bump for creative prompts and creator overrides preserved. If LFM fails, Qwen receives its instructions/context in the user turn per Groq guidance, with multimodal image parts preserved and sampling/reasoning adapted to the task.

**Privacy note:** OpenRouter's listing for this Liquid model says prompts and outputs may be retained and used to train Liquid models. CONVY sends its system instructions and relevant conversation context to the provider. Do not route secrets or sensitive personal/private information through this model.

### Groq and Mistral fallbacks

Add these optional API keys as Cloudflare Worker secrets to enable the providers:
- `GROQ_API_KEY`: enables the ordered Groq fallback models listed above. If a model is unavailable or rate-limited, CONVY tries the next Groq model before moving to Mistral.
- `MISTRAL_API_KEY`: enables `MISTRAL_MODEL` after Groq fails. The default is `ministral-14b-2512`.

Model IDs are configurable through `GROQ_QWEN_MODEL`, `GROQ_GPT_OSS_120B_MODEL`, `GROQ_GPT_OSS_20B_MODEL`, and `MISTRAL_MODEL` Worker variables. For Qwen, Groq-recommended user-turn prompting is used and images are preserved. Casual chat uses instruct-mode sampling (`temperature: 0.7`, `top_p: 0.8`) with no reasoning tokens; harder tasks switch to reasoning mode (`temperature: 1.0`, `top_p: 0.95`) and select low, medium, or high effort by complexity. A valid persistent creator setting from `!reasoning low|medium|high` overrides automatic effort; GPT-OSS models keep low reasoning by default. The bot never logs or exposes API key values.

**Billing note:** The Worker cannot inspect your provider account's billing mode or remaining free allowance. Use Groq's free/developer access if you want to avoid charges. Mistral's `ministral-14b-2512` is a metered model, so usage may consume your included monthly API allowance; the code cannot inspect your remaining allowance. Only configure `MISTRAL_API_KEY` when you are comfortable with that allowance being used, and leave Pay-as-you-go disabled if avoiding out-of-pocket charges is essential. Missing keys simply skip that provider.

### Pollinations free fallbacks

Create a server-side key at https://enter.pollinations.ai/keys and store it only as the `POLLINATIONS_API_KEY` Worker secret. The Worker reads `https://gen.pollinations.ai/models?source=community&reliability=reliable`, rejects explicitly down/unhealthy models, and requires a supported text chat-completions endpoint plus explicit numeric zero prices for both input and output text tokens. Any positive, malformed, or missing required price is rejected; `paid_only: false` alone is not proof that generation is free. Models whose health is unknown may be accepted when the reliable catalog has no observations, but their availability is not guaranteed. The built-in response style layer prioritizes answer-first concise replies, light Discord Markdown, and truthful tool-use claims. It is separate from the character, safety, and backend logic. `!models` forces a live Pollinations fetch and writes no catalog rows to D1. `!model 1-15` reuses the current verified snapshot when it is within the one-hour freshness window. Normal Pollinations routing uses a one-hour lazy-refresh snapshot in Durable Object storage; old catalog schemas and stale data are not used for inference requests.

`!models` displays the five Pollinations fallback models in this exact rank order:
1. `community/scriptsnsenses-sys/diffusiongema-26B-free` (Gemma Diffusion 26B)
2. `community/pegalink/jimmy` (Jimmy)
3. `community/YoannDev90/poolside-laguna-s-2.1:free` (Laguna S 2.1)
4. `community/YoannDev90/muse-glimmer-30b:free` (Muse Glimmer 30B)
5. `community/chirag-gamer/gpt-oss-120b` (GPT OSS 120B)

All five still must pass the live free-community catalog and pricing checks before they can be used. Up to ten other healthy/green eligible models can appear as alternatives at `!model 6` through `!model 15`. Model selection is creator-only; `!model auto` restores automatic routing. Image requests use only the explicit vision-capable set (Gemma Diffusion 26B and Muse Glimmer 30B), never a text-only model just because it ranks highly. Long Discord replies are split rather than silently truncated. Pollinations itself remains strictly zero-price verified. Groq/Mistral fallbacks are attempted only when their corresponding Worker API keys are configured; see the billing note above, especially for Mistral's metered API usage.

## Cloudflare

D1 database: `convx-discord-assistant`  
Database ID: `9da42b8b-4129-40bf-b19a-d76acb7ee801`

The deployed Worker is `convx-discord-assistant`. Required Worker secrets:
- `DISCORD_TOKEN`
- `POLLINATIONS_API_KEY`
- `OPENROUTER_API_KEY` (required for the OpenRouter primary; without it the Worker continues through the configured fallback chain)
- `GROQ_API_KEY` (optional; enables the three-model Groq fallback chain)
- `MISTRAL_API_KEY` (optional; enables the Mistral fallback after Groq; usage may consume included monthly API allowance)

Worker variables:
- `PRIMARY_MODEL_PROVIDER` (`openrouter` by default; can be set to `pollinations`)
- `OPENROUTER_MODEL` (defaults to `liquid/lfm-2.5-2.6b:free`; use only verified free IDs)
- `GROQ_QWEN_MODEL` (defaults to `qwen/qwen3.8-27b`)
- `GROQ_GPT_OSS_120B_MODEL` (defaults to `openai/gpt-oss-120b`)
- `GROQ_GPT_OSS_20B_MODEL` (defaults to `openai/gpt-oss-20b`)
- `MISTRAL_MODEL` (defaults to `ministral-14b-2512`)
- `TARGET_CHANNEL_ID`
- `BOT_USER_ID`
- `GUILD_ID`
- `ADMIN_ROLE_IDS` (comma-separated)
- `ADMIN_USER_IDS` (comma-separated, optional)
- `ALERT_USER_IDS` (optional)
- `ALERT_ROLE_IDS` (optional)
- `ALERT_CHANNEL_ID` (optional)

The cron trigger runs once per minute as a Gateway recovery/supervisor hook. Normal incoming messages are handled through the persistent Gateway connection. Model-catalog refreshes are demand-driven, cached for one hour in the Gateway Durable Object, and do not spend D1 row writes. `!models` requests a fresh live catalog. CONVY shows Discord's native typing indicator during addressed messages, refreshes it every eight seconds while processing, and stops it once a reply or error message is sent.

## Commands

Mention CONVY or reply to one of her messages to use the commands below, except that the creator can use the pause/resume phrases without mentioning her.

### Creator-only controls

The verified creator is Discord user ID `856033880405573632`.

| Command | Purpose |
|---|---|
| `!pause`, `shut up`, `stop replying`, `stop` | Pause CONVY for everyone until the creator resumes her. Exact phrases can be sent without an @mention. |
| `!start`, `start`, `start replying` | Resume CONVY. Only the creator can resume her. |
| `!config` | Show current runtime configuration and pause state. |
| `!model 1-15` / `!model auto` | Select a verified eligible model or restore automatic routing. |
| `!reasoning low|medium|high|auto` | Set persistent reasoning effort or return to automatic per-message settings. |
| `!temperature 0-1` / `!temperature auto` | Set persistent sampling temperature or automatic settings. |
| `!maxtokens 100-900` / `!maxtokens auto` | Set persistent output-token budget or automatic settings. |
| `!web on` / `!web off` | Enable or disable web search. Search is on by default. |
| `!search query` | Search the web and answer with returned source links when available. |
| `!images query` | Show up to three image previews with links to the original source pages. DuckDuckGo is attempted first, with Wikimedia Commons as a fallback. |
| `!version` | Show current build version, Git commit, source commit time, deployment timestamp, and deployment workflow link. |
| `!changes` | Show release notes for the current version and the previous recorded release. |
| `!inspect @member` | Inspect Discord-visible profile metadata and avatar/banner. A bio is shown only if the API actually provides one to the bot. |
| `!remember fact` | Save an owner-approved long-term memory. |
| `!memory` / `!forget ID` | List or remove an owner memory. |
| `!context` | Show the latest rolling channel context that CONVY can use. |
| `!runtime` | Show deployment-stamped build metadata, last successful model, routing order, and release notes. |

### Configured admin commands

These can be used by configured admins (admin user IDs and/or admin role IDs):
- `!add question | approved answer | optional tags`
- `!list`
- `!delete ID`
- `!sync` to queue a small batch of historical-message backfill
- `!models` to inspect the free-model catalog
- `save this` to extract one reliable FAQ from recent indexed history

Selecting models, changing persistent inference settings, pausing the assistant, inspecting a member profile, web search, and long-term memory management are restricted to the verified creator. An admin role does not grant these creator-only privileges.

## Profile inspection and web search

Profile inspection reports only metadata actually returned by Discord, including username/display name, account creation time, server join time, roles, avatar, and banner when available. The regular bot API may not include Discord's profile bio, so CONVY must not make one up. Avatar/banner images may be sent to the selected vision-capable model for description. CONVY should describe visible content without guessing someone's identity or sensitive traits from a picture.

Web search uses DuckDuckGo HTML results with a limited instant-answer fallback. Image search attempts DuckDuckGo's unauthenticated image endpoint and falls back to Wikimedia Commons; the DuckDuckGo image endpoint is unofficial and may change. Results can be incomplete or rate-limited. Image previews link to the original host/page rather than rehosting the files, and Commons attribution/license metadata is shown when available. A failed or empty search is reported instead of being presented as fact. The Google Custom Search JSON API is closed to new customers and scheduled to end on 1 January 2027, so this bot does not depend on it or scrape Google Search pages.

## Privacy and limits

The short context buffer stores the latest 24 non-empty text messages per accessible channel in Durable Object storage. D1 stores approved knowledge, owner memories, model statistics, and best-effort message history. Relevant excerpts and requested web results can be sent to the selected third-party model. Do not use the bot to collect secrets, passwords, private documents, or sensitive personal conversations. Profile inspection is creator-only.

Cloudflare free quotas and model/provider availability can change. D1's free-tier daily row-write quota resets at midnight UTC; stored data is not automatically deleted by the quota reset. If D1 rejects writes, retry D1-backed management commands after the reset. Short context and pause control are held separately from D1.

## Validation and deployment

Each push to `main` runs:
1. `node --check worker.js`
2. Wrangler configuration/bundle dry-run validation, including Durable Object migration validation
3. Deployment to the connected Cloudflare account, with `BUILD_VERSION`, `BUILD_COMMIT`, `BUILD_COMMIT_AT`, `BUILD_APPLIED_AT`, and the GitHub Actions run URL injected into Worker variables. `BUILD_APPLIED_AT` is recorded immediately before the deployment command; it is the deployment start timestamp, not an exact completion timestamp.

Do not put Discord tokens, Pollinations keys, or Cloudflare API tokens in the repository. GitHub Actions uses repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for deployment.


## Official Convx repository answers in CONVY

For questions that appear to ask how to use or configure Convx, CONVY attempts a live, read-only lookup against the official public repository `cosmictaserdev-creator/Convx`. It reads the repository file tree, ranks likely relevant files, and supplies a small set of source files and links to the model. Answers should cite those links and distinguish verified instructions from inference. If GitHub is unavailable or the files do not establish the answer, CONVY should say it could not verify the steps instead of inventing a menu path. This is read-only; no GitHub write token is required for the public repository.
