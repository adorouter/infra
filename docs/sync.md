# Price sync (new-api-sync)

`new-api-sync` creates and prices the reseller lanes. Today it covers one
marketplace, called `m1` in `sync/config.yml`, whose address and account live in
`sync.env` only, so which upstreams serve us stays out of git. One lane per merchant per model,
named like `m1-1234-gemini-4-argon`, at 2× the merchant's price and at least 20%
below list. Full runs happen on the server by hand, never on a schedule, because a
real run sends paid test requests. The only scheduled part is accepting price
changes (below), which sends none.

The gateway accepts the sync's token only from the `sync` network in
`compose.yml`, which holds the gateway and the sync and nothing else.

## Before the first run

These must already be deployed:

- a gateway build with the "Show official price" switch and the catalog that hides unpriced models
- a website build from the same day
- this `infra` commit, with the `sync` service and `sync/config.yml`
- a `new-api-sync` commit with the `m1-<listing>-<model>` lane names

## One-time setup

Over SSH:

1. Update the server's copy of this repository:

   ```bash
   cd /opt/adorouter && git pull
   ```

2. Build the sync image from its repository, and note the commit:

   ```bash
   git clone https://github.com/adorouter/new-api-sync.git /opt/new-api-sync
   ```

   ```bash
   cd /opt/new-api-sync && git rev-parse --short HEAD && docker build -t adorouter-sync:local . && cd /opt/adorouter
   ```

3. Create the sync's token:

   ```bash
   openssl rand -hex 32
   ```

   Put that value in `gateway.env` as `SYNC_SERVICE_TOKEN=`.

4. Create `sync.env`:

   ```bash
   cp sync.env.example sync.env && chmod 600 sync.env
   ```

   Fill it in: the token from step 3 as `ADOROUTER_SYNC_TOKEN`, then the marketplace's address, its personal access token and user ID, and an internal name for it.

5. Create the log folder for the image's user:

   ```bash
   mkdir -p sync/logs && chown 65532:65532 sync/logs
   ```

6. Restart the gateway, so it joins the sync network and reads the token. This takes a few seconds:

   ```bash
   docker compose up -d gateway
   ```

7. Let the sync create channels. The gateway gives the sync its own identity, `user:900000001`, and creating a channel needs a permission that admins don't get by default. Without it every channel create fails with "no response":

   ```bash
   docker compose exec -T postgres psql -U adorouter -d adorouter -c "INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5) VALUES ('p', 'user:900000001', 'channel', 'sensitive_write', 'allow', '', '') ON CONFLICT DO NOTHING;"
   ```

   Then restart the gateway so it loads the permission:

   ```bash
   docker compose restart gateway
   ```

## Every run

1. **Dry run first.** It changes nothing and costs nothing:

   ```bash
   docker compose --profile sync run --rm sync run --only m1 --type text --dry-run
   ```

   The end of the output lists the lanes it would add (`Channels: +N`) and every model's price.

2. **Real run.** This creates one key and one pin per lane on the marketplace, and sends a few short test requests to each lane, paid from the marketplace balance. Top it up first, because the run stops when the balance is empty.

   ```bash
   docker compose --profile sync run --rm sync run --only m1 --type text
   ```

3. **Check it.**
   - adorouter.com/models shows the new lanes, with the official price crossed out. If it doesn't, turn on **System Settings > Currency & Display > Show official price**.
   - Send one request to a new lane. Compare what the marketplace deducted with what the usage log charged.

Merchants change their prices and drop out often, so run it again every few days. Scheduling it would send paid tests on its own, so that needs a decision first.

## Price changes between runs

When a merchant raises its price, the marketplace pauses our pin and that lane fails every request until the change is accepted. `price-notices` accepts a rise only while the lane's current price still covers the new cost plus 25%, and leaves larger rises paused until the next full run reprices the lane. It sends no test requests and changes no prices on our side.

Add it to root's crontab (`crontab -e`), every 30 minutes:

```
*/30 * * * * cd /opt/adorouter && docker compose --profile sync run --rm -T sync price-notices --only m1 >> /var/log/adorouter-price-notices.log 2>&1
```

Check it with `tail /var/log/adorouter-price-notices.log`: each run ends with `price changes accepted: N, left paused: N`.

## Preview without a funded account

`--preview` works out the lanes like a dry run (no keys, pins or tests on the marketplace, no cost) and then writes them to the gateway with a placeholder key, so the site shows the models and prices. **Every request to those lanes fails** until a real run, and customers can pick them in the meantime.

```bash
docker compose --profile sync run --rm sync run --only m1 --type text --preview
```

**Remove the preview lanes before the first real run.** A real run keeps each lane's on/off state, and the gateway switches off lanes whose requests fail, so a leftover placeholder lane would stay off.

```bash
docker compose --profile sync run --rm sync reset --only m1
```

## Undo

`docker compose --profile sync run --rm sync reset --only m1` deletes the marketplace lanes and their models, and nothing else.

**Never run `reset` without `--only m1`.** On its own it deletes every channel with a tag and wipes all model prices and price groups on the gateway.
