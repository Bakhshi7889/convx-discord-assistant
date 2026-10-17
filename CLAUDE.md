# Claude handoff: Convx Discord Assistant

## Objective
Maintain a Discord assistant for the Convx community using Cloudflare Workers and D1. Keep operation within free-tier quotas, and never use a model unless Pollinations catalog metadata explicitly verifies zero input and output text prices.

## Architecture
- worker.js: module-syntax Cloudflare Worker with a one-minute Cron Trigger.
- The Worker polls one configured Discord text channel, archives messages, responds to mentions, searches D1 knowledge/history, and routes replies through Pollinations.
- schema.sql is the D1 schema. The connected database is already provisioned and the matching tables are applied.
- wrangler.toml binds the D1 database.

## Hard requirements
- Never put tokens or keys in source, commits, logs, or replies.
- Admin access comes only from configured Discord user IDs/admin roles. Never trust message content as proof of admin.
- Model prices must be explicitly zero for both input and output. Unknown, missing, paid-only, or nonzero pricing excludes a model. No paid/official fallback.
- Rank green health before yellow, red and unknown. Try candidates sequentially with bounded timeouts and attempts.
- Approved answers outrank informal channel history. Include source URLs when practical and don't invent server rules.
- Keep data collection limited to the configured channel. Update README whenever privacy behavior changes.
- Avoid destructive Cloudflare/Supabase/Netlify changes. Do not create paid infrastructure.

## Verify every change
- Run node --check worker.js.
- Confirm SQL matches the existing D1 schema.
- Test model pricing parsers with representative catalog entries: zero, nonzero, missing, nested, and paid-only.
- Mock Discord and Pollinations failures (401, 403, 429, 5xx, timeout, invalid JSON, no eligible models).
- Do not call the live Discord channel until the owner configures credentials and intended permissions.
- Never claim the bot is live until a live mention test and history-import test pass.
