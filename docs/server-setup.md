# Server setup

From nothing to adorouter.com running. Every secret stays on the server or in Cloudflare or GitHub, never in chat or Git.

## 1. Images

1. On GitHub, turn Actions on for `adorouter/new-api` and `adorouter/adorouter`. Only `ghcr.yml` is needed on each, so disable the others.
2. In `adorouter/adorouter`, under **Settings > Secrets and variables > Actions > Secrets**, add `LEGAL_NAME`, `LEGAL_ADDRESS` and, if VAT registered, `LEGAL_VAT_ID` when you're ready to publish them. The build warns until the first two exist, and the legal notice leaves out the operator section. **Set them before the Creem review.**
3. Run each `GHCR Image` workflow once. In each repo, under **Packages**, set the image's visibility to public, as the code is.

Note the commit each build used. Those go in `.env` as `GATEWAY_COMMIT` and `SITE_COMMIT`.

## 2. Server

Rent a Linux x86-64 server, Ubuntu 24.04 LTS, with 4 GB of memory or more, in the EU. Then, over SSH:

```bash
curl -fsSL https://get.docker.com | sh
```

```bash
ufw allow OpenSSH && ufw enable
```

```bash
apt-get install -y age
```

```bash
git clone https://github.com/adorouter/infra.git /opt/adorouter && cd /opt/adorouter
```

```bash
cp env.example .env && cp gateway.env.example gateway.env && cp site.env.example site.env && chmod 600 .env gateway.env site.env
```

Fill in the three files. The comments in each say how to generate its secrets. `BFF_SERVICE_TOKEN` must match in `gateway.env` and `site.env`.

## 3. Cloudflare Tunnel

1. In the Cloudflare dashboard, go to **Zero Trust > Networks > Tunnels > Create a tunnel**, type **Cloudflared**, name `adorouter`.
2. Copy the token from the install command into `TUNNEL_TOKEN` in `.env`. Skip the install: Compose runs it.
3. Add two public hostnames:
   - `adorouter.com` to `http://site:3000`
   - `api.adorouter.com` to `http://gateway:3000`
4. Keep the Email Routing records for `support@adorouter.com` as they are.

## 4. Discord

In the Discord Developer Portal, on your **production** app, under **OAuth2 > Redirects**, add `https://api.adorouter.com/oauth/discord`.

## 5. Start

```bash
docker compose up -d
```

```bash
docker compose ps
```

All five services should say `running`, with `gateway` and `postgres` `healthy`. Then follow `admin-access.md` for the first admin, and `gateway-settings.md` for the options.

## 6. Backups

1. On **your own computer**, not the server, run `age-keygen -o adorouter-backup.key`. Keep that file safe in two places. It prints a public key: put that in `BACKUP_AGE_RECIPIENT`.
2. In Cloudflare, create an R2 bucket and an API token limited to it. Put the endpoint, bucket and token in `.env`.
3. Add the nightly job with `crontab -e`:

   ```
   15 3 * * * /opt/adorouter/scripts/backup.sh >> /var/log/adorouter-backup.log 2>&1
   ```

4. Run `scripts/backup.sh` once by hand and check that the file arrives.
5. **Prove a restore works** before anyone relies on this. Copy the backup and your key to the server temporarily, then:

   ```bash
   scripts/verify-restore.sh <backup.tar.age> <adorouter-backup.key>
   ```

   Remove the key from the server afterwards.

Backups aren't pruned automatically. Add a lifecycle rule on the bucket, and keep them for no longer than the Privacy page says.

## 7. Monitor

In `adorouter/infra`, turn Actions on and add a `DISCORD_ALERT_WEBHOOK` secret. `monitor.yml` checks the site and API status pages every 15 minutes. It never calls a model, so it costs no provider credit.

## Deploying

Set `GATEWAY_COMMIT` or `SITE_COMMIT` in `.env`, then:

```bash
docker compose up -d
```

Going back is the same, with the previous commit.

## Taking the site offline

For maintenance, stop the public services with `docker compose stop site gateway`. Cloudflare then shows its own error page. Keep this off during the Creem review, because reviewers need a working site.
