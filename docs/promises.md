# Promises and their tests

What the legal pages promise, and what checks each promise. `tests/promises.mjs` runs against a throwaway gateway on real Postgres and Redis, using `tests/run-promises.sh`. If a change would break one of these, stop and ask.

| Promise | Checked by |
| --- | --- |
| No storing prompts or responses | `promises.mjs`: searches every database table and the usage logs for a marked prompt |
| Image, video, task and Midjourney routes are off | `promises.mjs`, `new-api/middleware/ado_relay_allowlist_test.go` |
| Chat replies aren't kept on the website's server | `adorouter/src/app/api/[[...route]]/route.ts` closes every other chat route, and `forward.service.ts` doesn't buffer. No automated test yet |
| Moderation doesn't send prompts to payment providers | `promises.mjs`: `CreemModerationEnabled`, `StripeTextModerationEnabled` |
| No analytics or trackers | `promises.mjs`: console page. The website has no automated test yet |
| Providers get no visitor IP, cookies or adorouter key | `promises.mjs`: a fake provider captures what it receives, streamed and not |
| Provider cookies and headers don't reach users | `promises.mjs`, `new-api/service/ado_response_headers_test.go` |
| Discord sign-in needs a verified email | `new-api/oauth/ado_discord_policy_test.go` |
| Password accounts work, and get no free credit | `promises.mjs` |
| Deleting an account really deletes it | `new-api/model/ado_account_purge_test.go` |
| Usage logs are metadata only | `promises.mjs`: no prompt, IP or client fingerprint |
| Usage logs go after 90 days | `new-api/service/ado_log_retention.go`. Not covered by `promises.mjs` |
| One signup grant per Discord account | `new-api/service` and `new-api/model` signup grant tests |
| Prices are list +25%, including website keys | `promises.mjs`: the `auto` group charges a ratio of 1.25 |
