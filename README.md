# infra

How adorouter runs: one Linux server with Docker Compose, behind a Cloudflare Tunnel.

- `compose.yml`: gateway, site, Postgres, Redis and the tunnel. Images are pinned by commit in `.env`.
- `docs/server-setup.md`: from nothing to running, then deploying and rolling back.
- `docs/admin-access.md`, `docs/gateway-settings.md`: first admin and required settings.
- `scripts/`: encrypted backups and restores.
- `tests/run-promises.sh`: checks the promises on the legal pages against a throwaway gateway.

Never commit secrets here. Variable names go in the `*.example` files, and real values stay on the server.
