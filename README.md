# Convx Discord Assistant

A Cloudflare Worker + D1 Discord assistant for Convx. It polls up to 20 accessible guild channels per minute, archives messages with per-channel cursors, and replies to mentions. It answers from admin-approved knowledge first and uses Pollinations text models only when text input and output prices are explicitly zero. CONVY uses she/her and a concise, dryly funny code-reviewer voice without theatrical roast monologues or model-ID signatures. She reads the original message when a user replies to it and mentions CONVY, then answers in the same text channel or active thread. Forum/media posts are handled as threads; their parent forum channels are not direct message destinations. Every direct reply pings only the user being answered; a roast can also ping the explicitly targeted member. Role mentions are disabled in replies and failure alerts. Explicit member roast commands use short deterministic jokes rather than an LLM-generated roast, avoiding fabricated details and gibberish. Serious questions remain accurate and careful.

## Discord setup

1. Open https://discord.com/developers/applications and create an application.
2. Open **Bot**, create the bot, enable **Message Content Intent**, and copy its token privately.
3. Under **OAuth2 → URL Generator**, select `bot` and `applications.commands`. Grant View Channel and Read Message History for channels it should monitor, Send Messages in ordinary text/announcement channels, and Send Messages in Threads for thread replies, including forum/media posts, then invite it to Convx.
4. Copy the Application ID (bot user ID), target channel ID, server ID, and admin role IDs. Enable Developer Mode in Discord settings to copy IDs.

## Pollinations setup

Create a server-side secret key at https://enter.pollinations.ai/keys. Store it only as a Cloudflare Worker secret. The worker refreshes the Pollinations community text-model catalog (`community=true&reliability=all`). It excludes `paid_only` models, explicitly priced text models with nonzero or unparseable rates, and agent wrappers that may call billable child models. A community model with a pricing object but no text-token rate fields is treated as zero-rate. `!models` shows only healthy/green eligible models; red/down, yellow/degraded and unknown-health models are hidden. Scores out of 100 weight provider health (20), provider success (20), smoothed CONVY success (25), Text Arena open-source model-family quality (25), and speed (10). Arena family data is a dated prior, not a guarantee about the community host. Local successes, failures and elapsed response times are recorded. Long Discord replies are split instead of silently truncated. A per-message claim prevents overlapping scheduled polls from replying twice to the same mention. Save-this extraction parses JSON, fenced JSON, and labelled Q&A text, then retries once before failing safely. Nonzero-priced models are never attempted, and payment-required stops fallback immediately.

## Cloudflare

D1 database: `convx-discord-assistant`  
Database ID: `9da42b8b-4129-40bf-b19a-d76acb7ee801`

The deployed Worker is `convx-discord-assistant`. Set these Worker secrets/variables after creating the Discord bot:

- Secret: `DISCORD_TOKEN`
- Secret: `POLLINATIONS_API_KEY`
- Variable: `TARGET_CHANNEL_ID`
- Variable: `BOT_USER_ID`
- Variable: `GUILD_ID`
- Variable: `ADMIN_ROLE_IDS` (comma-separated role IDs)
- Variable: `ADMIN_USER_IDS` (comma-separated Discord user IDs; optional)
- Optional variable: `ALERT_USER_IDS` (additional user IDs to ping on failures)
- Optional variable: `ALERT_ROLE_IDS` (additional role IDs to ping on failures)
- Optional variable: `ALERT_CHANNEL_ID` (channel where background-failure alerts should be posted; defaults to `TARGET_CHANNEL_ID`)

Cron runs once per minute. The primary channel is checked every run and up to 19 other channels are rotated through each run, so reaction time in a larger server can be longer. Inaccessible private channels are skipped and do not block polling elsewhere. Cloudflare and Pollinations free quotas/availability can change; never promise unlimited use. Models with positive Pollen rates are excluded from CONVY's free-only pool, even if they are not marked `paid_only`, so the bot does not consume Pollen for routine replies.

## Admin commands

Mention the bot in the configured channel:

- `@Convx Assistant !add question | approved answer | optional tags`
- `@Convx Assistant !list`
- `@Convx Assistant !delete ID`
- `@Convx Assistant !sync` (start/restart history backfill)
- `@Convx Assistant !models` (healthy/green free models only, ranked by measured health and a dated Text Arena family prior)
- `@Convx Assistant !help`
- `@Convx Assistant roast @member` (one-line playful roast; a real tagged member is required)
- `@Convx Assistant save this` (admin-only: turns the latest 30 indexed messages in the current channel into one approved Q&A, with tags)

Admin failure alerts ping the configured `ADMIN_USER_IDS` only, never moderator or alert roles, and are rate-limited per error type. Admin role IDs are still used to authorize admin commands. Mention parsing stays disabled except for explicitly configured bot/user/role IDs.

Admins are identified by configured user IDs and/or configured admin roles. Never rely on admin status supplied in message text.

## Data and privacy

Messages from accessible text/announcement channels and active public/private/announcement threads (including forum/media posts) within the configured guild are stored in D1, including author identifiers/names, timestamps, message URLs, approved knowledge entries, and model health/latency statistics. When a user replies to an older message and mentions CONVY, the bot reads the referenced message through Discord's message reference or fetches it directly if needed. Referenced content is treated as untrusted context, not instructions. Newly discovered threads are seeded with recent history; fresh bot mentions in the last 15 minutes are handled once during initial seeding. A new channel's initial snapshot stores the latest 100 messages; conversational saving uses the most recent 30 indexed messages from the current channel. Relevant excerpts are sent to the selected third-party model. The question and limited relevant excerpts are sent to the selected third-party model. Tell server members this channel is indexed. Do not store secrets or sensitive personal conversations.

## Local checks

Node.js is sufficient to syntax-check `worker.js`:

```bash
node --check worker.js
```

GitHub Actions checks Worker syntax and deployment configuration on every push. End-to-end live-model replies and conversation saving still need a Discord test with correct bot installation and channel permissions.


## GitHub Actions

Every push to main runs a Worker syntax/configuration check. The workflow's deployment job is manual so it doesn't fail before deployment credentials are configured. To enable it, open **Repository → Settings → Secrets and variables → Actions** and add:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with permission to edit Workers Scripts and access the existing D1 binding.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.

Then open **Actions → Validate and deploy Convx Assistant → Run workflow**. The Worker is already deployed directly from the connected Cloudflare account; these GitHub secrets are only for later GitHub-triggered deployments. Do not add Discord or Pollinations keys to GitHub.
