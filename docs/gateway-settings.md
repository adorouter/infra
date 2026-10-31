# Gateway settings

What adorouter's gateway needs beyond upstream's defaults. Names only: real values stay on the server.

## Environment

| Variable | Why |
| --- | --- |
| `SQL_DSN` | Postgres. The database must be UTF-8 |
| `REDIS_CONN_STRING` | Required, because website sign-in crosses to the gateway |
| `SESSION_SECRET`, `CRYPTO_SECRET` | Sessions |
| `TOKEN_KEY_PEPPER`, `TOKEN_KEY_ENC_KEY`, `CHANNEL_KEY_ENC_KEY` | Encrypt API and provider keys. Each must be 32 bytes in base64. The gateway won't start without them, and losing them invalidates every key |
| `ADO_SITE_URL` | Where the API address sends visitors, and upstream's public console pages. `compose.yml` sets it |
| `TRUSTED_PROXIES` | Only the tunnel's network, so visitor IPs can't be forged. `compose.yml` sets it |
| `REGISTER_IP_HASH_KEY`, `AUDIT_FINGERPRINT_KEY` | Keyed hashes for abuse checks and audit logs |
| `BFF_SERVICE_TOKEN` | Same value on the website |
| `DISCORD_GUILD_ID` | Sign-in refuses everyone without it |
| `OAUTH_ALLOWED_REDIRECT_ORIGINS` | The website's origin, for example `https://adorouter.com` |
| `ADO_FINGERPRINT_KEY` | Signup credit. Without it nobody gets credit. **Changing it allows every Discord account a second grant** |
| `ADO_SIGNUP_GRANT_USD` | Optional, default `0.5`. `0` turns the grant off |
| `ADO_SIGNUP_GRANT_DAILY_LIMIT` | Optional, default `20` per rolling 24 hours, so at most $10 a day at the default grant |
| `ADO_ALERT_WEBHOOK_URL` | Optional Discord webhook, used when the daily limit is reached |

Never set `DEBUG`, `POSTHOG_KEY`, `GOOGLE_ANALYTICS_ID`, `UMAMI_WEBSITE_ID` or `LOG_ALL_CLIENT_HEADERS` in production.

## Options, set in the console

| Option | Value | Why |
| --- | --- | --- |
| `ServerAddress` | The API's public address | Discord's redirect is built from it |
| `discord.client_id`, `discord.client_secret`, then `discord.enabled` | Your production Discord app | In that order, or enabling is refused |
| `RegisterEnabled` | `true` | Discord sign-up creates accounts |
| `PasswordRegisterEnabled`, `PasswordLoginEnabled` | `false` | See `admin-access.md` for the order |
| `GroupRatio` | `{"default":1.25,"svip":1.25,"vip":1.25}` | The +25% markup. Every group carries it, so no group is a cheaper way in |
| `UserUsableGroups` | `{"default":"default","auto":"auto"}` | Users can't choose another price group. `auto` must stay: the website's key uses it, and it resolves to `default` |
| `SystemName` | `adorouter` | Name on the gateway console and its sign-in page |
| `Logo` | `https://adorouter.com/images/logo/logo.svg` | Logo on the same pages |
| `ReferralCommissionEnabled` | `true` | Affiliate programme |
| `ReferralCommissionPercent` | `5` | The stack's default of 10 leaves almost no margin on small top-ups |
| `ReferralCommissionMaxRecharges` | `3` | Commission on a referred user's first 3 top-ups |
| `QuotaForNewUser`, `QuotaForInviter`, `QuotaForInvitee` | `0` | Upstream's bonuses have no repeat or age protection, so adorouter's own grant replaces them |
| `CreemModerationEnabled`, `StripeTextModerationEnabled` | `false` | These would send prompts to payment providers |

Payments also need the admin to confirm the payment compliance statement in the console, or top-ups stay disabled. That's a legal statement, so read it first.

## Pricing

The gateway's built-in DeepSeek prices matched the published list on 2026-10-30. DeepSeek changes prices, so compare them when it announces a change. `deepseek-flash` and `deepseek-v4-pro` bill half price off-peak.
