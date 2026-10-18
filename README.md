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

## Pollinations and model routing

Create a server-side key at https://enter.pollinations.ai/keys and store it only as the `POLLINATIONS_API_KEY` Worker secret. The Worker reads `https://gen.pollinations.ai/models?source=community&reliability=reliable`, then requires `health.status === "healthy"`, a supported text chat-completions endpoint, and explicit numeric zero prices for both input and output text tokens. Any positive, malformed, or missing required price is rejected; `paid_only: false` alone is not considered proof that generation is free. `!models` forces a live fetch and writes no catalog rows to D1. `!model 1-15` reuses the current verified snapshot when it is within the one-hour freshness window, rather than immediately forcing a second catalog request. The bot reports when a fresh catalog couldn't be saved. Normal routing uses a one-hour lazy-refresh snapshot in Durable Object storage; old catalog schemas and stale data are not used for inference requests. Catalog health is not a live guarantee.

`!models` displays the preferred models plus up to 12 alternative models. Model selection is creator-only: `!model 1` through `!model 15`, or `!model auto` to restore automatic routing. Images stay on the configured vision-capable models. Long Discord replies are split rather than silently truncated. No paid fallback is attempted if the free stack fails.

## Cloudflare

D1 database: `convx-discord-assistant`  
Database ID: `9da42b8b-4129-40bf-b19a-d76acb7ee801`

The deployed Worker is `convx-discord-assistant`. Required Worker secrets:
- `DISCORD_TOKEN`
- `POLLINATIONS_API_KEY`

Worker variables:
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
