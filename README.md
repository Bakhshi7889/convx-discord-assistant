# Convx Discord Assistant

A small Cloudflare Worker + D1 Discord assistant for the Convx server. It polls one configured channel every minute, archives its messages, replies when mentioned, answers from admin-approved knowledge first, and falls back across verified-zero-price Pollinations community text models.

## Discord setup

1. Open https://discord.com/developers/applications and create an application.
2. Open **Bot**, create the bot, enable **Message Content Intent**, and copy its token privately.
3. Under **OAuth2 → URL Generator**, select `bot` and `applications.commands`. Grant View Channel, Read Message History, Send Messages and Send Messages in Threads, then invite it to Convx.
4. Copy the Application ID (bot user ID), target channel ID, server ID, and admin role IDs. Enable Developer Mode in Discord settings to copy IDs.

## Pollinations setup

Create a server-side secret key at https://enter.pollinations.ai/keys. Store it only as a Cloudflare Worker secret. The worker refreshes the public community text-model catalog, checks that both input and output text prices are explicitly zero, ranks green before yellow before red, and tries candidates sequentially. Unknown prices are excluded. It must never intentionally select a paid model.

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

Cron runs once per minute, so mention replies are not instantaneous. This design avoids a permanently-running Gateway process, with the tradeoff of periodic polling. Cloudflare and Pollinations free quotas/availability can change; never promise unlimited use.

## Admin commands

Mention the bot in the configured channel:

- `@Convx Assistant !add question | approved answer | optional tags`
- `@Convx Assistant !list`
- `@Convx Assistant !delete ID`
- `@Convx Assistant !sync` (start/restart history backfill)
- `@Convx Assistant !models`
- `@Convx Assistant !help`

Admins are identified by configured user IDs and/or configured admin roles. Never rely on admin status supplied in message text.

## Data and privacy

Only the configured channel is archived. Messages, author identifiers/names, timestamps, URLs, approved knowledge entries, and model status are stored in D1. The question and limited relevant excerpts are sent to the selected third-party model. Tell server members this channel is indexed. Do not store secrets or sensitive personal conversations.

## Local checks

Node.js is sufficient to syntax-check `worker.js`:

```bash
node --check worker.js
```

The implementation has not been end-to-end tested using your live Discord and Pollinations credentials. Test it in a private Discord channel before relying on it for onboarding.


## GitHub Actions

Every push to main runs a Worker syntax/configuration check. The workflow's deployment job is manual so it doesn't fail before deployment credentials are configured. To enable it, open **Repository → Settings → Secrets and variables → Actions** and add:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with permission to edit Workers Scripts and access the existing D1 binding.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.

Then open **Actions → Validate and deploy Convx Assistant → Run workflow**. The Worker is already deployed directly from the connected Cloudflare account; these GitHub secrets are only for later GitHub-triggered deployments. Do not add Discord or Pollinations keys to GitHub.
