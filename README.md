# Convx Discord Assistant

A Cloudflare Worker + D1 Discord assistant for Convx. It polls up to 20 accessible guild channels per minute, archives messages with per-channel cursors, and replies to mentions. It answers from admin-approved knowledge first and uses Pollinations text models only when input and output prices are explicitly zero.

## Discord setup

1. Open https://discord.com/developers/applications and create an application.
2. Open **Bot**, create the bot, enable **Message Content Intent**, and copy its token privately.
3. Under **OAuth2 → URL Generator**, select `bot` and `applications.commands`. Grant View Channel, Read Message History, Send Messages and Send Messages in Threads, then invite it to Convx.
4. Copy the Application ID (bot user ID), target channel ID, server ID, and admin role IDs. Enable Developer Mode in Discord settings to copy IDs.

## Pollinations setup

Create a server-side secret key at https://enter.pollinations.ai/keys. Store it only as a Cloudflare Worker secret. The worker refreshes the public text-model catalog hourly, recognizes Pollinations' `promptTextPrice` and `completionTextPrice` fields, excludes models that are paid-only or have unknown/non-zero text prices, then ranks health and observed response latency. It records local success and latency statistics. A payment-required response stops fallback immediately; it must never intentionally use a paid model.

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

Cron runs once per minute. The primary channel is checked every run and up to 19 other channels are rotated through each run, so reaction time in a larger server can be longer. Inaccessible private channels are skipped and do not block polling elsewhere. Cloudflare and Pollinations free quotas/availability can change; never promise unlimited use.

## Admin commands

Mention the bot in the configured channel:

- `@Convx Assistant !add question | approved answer | optional tags`
- `@Convx Assistant !list`
- `@Convx Assistant !delete ID`
- `@Convx Assistant !sync` (start/restart history backfill)
- `@Convx Assistant !models`
- `@Convx Assistant !help`
- `@Convx Assistant save this` (admin-only: turns the latest 30 indexed messages in the current channel into one approved Q&A, with tags)

Admin failure pings use configured admin/alert user and role IDs, and are rate-limited per error type. Mention parsing stays disabled except for those explicit configured IDs.

Admins are identified by configured user IDs and/or configured admin roles. Never rely on admin status supplied in message text.

## Data and privacy

Messages from accessible channels and active threads within the configured guild are stored in D1, including author identifiers/names, timestamps, message URLs, approved knowledge entries, and model health/latency statistics. A new channel's initial snapshot stores the latest 100 messages; conversational saving uses the most recent 30 indexed messages from the current channel. Relevant excerpts are sent to the selected third-party model. The question and limited relevant excerpts are sent to the selected third-party model. Tell server members this channel is indexed. Do not store secrets or sensitive personal conversations.

## Local checks

Node.js is sufficient to syntax-check `worker.js`:

```bash
node --check worker.js
```

Syntax checks pass, but end-to-end live-model replies and conversational saving still need a Discord test after installation and channel permissions are correct.


## GitHub Actions

Every push to main runs a Worker syntax/configuration check. The workflow's deployment job is manual so it doesn't fail before deployment credentials are configured. To enable it, open **Repository → Settings → Secrets and variables → Actions** and add:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with permission to edit Workers Scripts and access the existing D1 binding.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.

Then open **Actions → Validate and deploy Convx Assistant → Run workflow**. The Worker is already deployed directly from the connected Cloudflare account; these GitHub secrets are only for later GitHub-triggered deployments. Do not add Discord or Pollinations keys to GitHub.
