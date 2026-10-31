// Checks the promises on adorouter's legal pages against a running gateway.
// Prints no keys, tokens or passwords. Needs a brand new gateway, so run it with
// tests/run-promises.sh, which starts and removes one. Never point this at production.
//
//   GATEWAY_URL     gateway base URL (default http://127.0.0.1:13000)
//   UPSTREAM_HOST   how the gateway reaches this script (default 127.0.0.1)
//   DB_URL          optional Postgres URL, to search stored data for the test prompt
//   PG_MODULE_DIR   optional directory holding node_modules/pg, needed with DB_URL
//   EXPECT_SITE_URL optional, the gateway's ADO_SITE_URL, to check its redirects
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const GW = process.env.GATEWAY_URL ?? "http://127.0.0.1:13000";
const CANARY = `PROMISECANARY${randomBytes(6).toString("hex")}`;
const VISITOR_IP = "198.51.100.77";
const COOKIE_MARK = "promisecookie";
const MODEL = "gpt-4o-mini";
const CHANNEL = "promise-capture";

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

const captured = [];
const upstream = createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    captured.push({ url: req.url, headers: req.headers, body });
    const parsed = JSON.parse(body || "{}");
    if (parsed.stream) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Set-Cookie": "providercookie=1", "X-Provider-Secret": "providerheader" });
      res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", model: MODEL, choices: [{ index: 0, delta: { role: "assistant", content: "ok" } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", model: MODEL, choices: [], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } })}\n\n`);
      res.end("data: [DONE]\n\n");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": "providercookie=1", "X-Provider-Secret": "providerheader" });
    res.end(JSON.stringify({ id: "c", object: "chat.completion", model: MODEL, choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } }));
  });
});
await new Promise((r) => upstream.listen(0, "0.0.0.0", r));
const upstreamUrl = `http://${process.env.UPSTREAM_HOST ?? "127.0.0.1"}:${upstream.address().port}`;

// A new gateway is the only place a password admin can exist: the setup wizard makes
// one, and password login goes off straight after, as on a real deployment.
const ADMIN_USER = "promiseadmin";
const ADMIN_PASS = randomBytes(24).toString("hex");
const jsonPost = async (path, body) => (await fetch(GW + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
const setup = await jsonPost("/api/setup", { username: ADMIN_USER, password: ADMIN_PASS, confirmPassword: ADMIN_PASS, SelfUseModeEnabled: false, DemoSiteEnabled: false });
if (!setup.success) { console.log("setup failed:", setup.message, "(this test needs a brand new gateway)"); process.exit(1); }
const login = await jsonPost("/api/user/login", { username: ADMIN_USER, password: ADMIN_PASS });
if (!login.success) { console.log("admin login failed:", login.message); process.exit(1); }
const adminHeaders = { Authorization: `Bearer ${login.data.access_token}`, "New-Api-User": String(login.data.user.id), "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(GW + path, { method, headers: adminHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
  try { return await r.json(); } catch { return { success: false, message: `status ${r.status}` }; }
};

let channelId, tokenId;
try {
  // The settings from docs/gateway-settings.md that these promises depend on.
  const settings = {
    GroupRatio: JSON.stringify({ default: 1.25, svip: 1.25, vip: 1.25 }),
    UserUsableGroups: JSON.stringify({ default: "default", auto: "auto" }),
    PasswordRegisterEnabled: "false",
    PasswordLoginEnabled: "false",
    QuotaForNewUser: "0",
    QuotaForInviter: "0",
    QuotaForInvitee: "0",
  };
  for (const [key, value] of Object.entries(settings)) {
    const set = await api("PUT", "/api/option/", { key, value });
    if (!set.success) throw new Error(`set ${key}: ${set.message}`);
  }
  const added = await api("POST", "/api/channel/", { mode: "single", channel: { name: CHANNEL, type: 1, key: "capture-key", base_url: upstreamUrl, models: MODEL, group: "default", status: 1 } });
  if (!added.success) throw new Error(`add channel: ${added.message}`);
  const channels = await api("GET", "/api/channel/?p=1&page_size=100");
  channelId = (channels.data?.items ?? []).find((c) => c.name === CHANNEL)?.id;

  const name = `promise-${Date.now()}`;
  const token = await api("POST", "/api/token/", { name, expired_time: -1, remain_quota: 0, unlimited_quota: true, group: "default" });
  if (!token.success) throw new Error(`create key: ${token.message}`);
  tokenId = ((await api("GET", "/api/token/?p=1&size=100")).data?.items ?? []).find((t) => t.name === name)?.id;
  const revealed = await api("POST", `/api/token/${tokenId}/key`);
  const rawKey = String(revealed.data?.key ?? revealed.data);
  const apiKey = rawKey.startsWith("sk-") ? rawKey : `sk-${rawKey}`;

  const clientHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "promise-test-client/1.0",
    "X-Forwarded-For": VISITOR_IP,
    "X-Real-Ip": VISITOR_IP,
    "CF-Connecting-IP": VISITOR_IP,
    "True-Client-IP": VISITOR_IP,
    Forwarded: `for=${VISITOR_IP}`,
    Cookie: `${COOKIE_MARK}=1`,
    Referer: "https://client.example/page",
  };
  const message = { model: MODEL, messages: [{ role: "user", content: `say ok ${CANARY}` }] };

  // With Redis on, the gateway caches channels in memory and refreshes them
  // periodically, so a channel added a moment ago takes a while to become routable.
  const readyBy = Date.now() + 120_000;
  let ready = false;
  while (!ready && Date.now() < readyBy) {
    const probe = await fetch(`${GW}/v1/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "probe" }] }) });
    await probe.text();
    ready = probe.ok;
    if (!ready) await new Promise((r) => setTimeout(r, 5000));
  }
  check("new channel becomes routable", ready);
  captured.length = 0;

  // Provider sees no visitor identity.
  const plain = await fetch(`${GW}/v1/chat/completions`, { method: "POST", headers: clientHeaders, body: JSON.stringify(message) });
  await plain.text();
  check("request through the fake provider succeeds", plain.ok, `status ${plain.status}`);
  check("client doesn't receive provider cookies", !plain.headers.get("set-cookie"));
  check("client doesn't receive other provider headers", !plain.headers.get("x-provider-secret"));
  const stream = await fetch(`${GW}/v1/chat/completions`, { method: "POST", headers: clientHeaders, body: JSON.stringify({ ...message, stream: true }) });
  const streamBody = await stream.text();
  check("streamed request succeeds", stream.ok && streamBody.includes("[DONE]"), `status ${stream.status}`);
  check("streamed client doesn't receive provider cookies", !stream.headers.get("set-cookie"));
  check("streamed client doesn't receive other provider headers", !stream.headers.get("x-provider-secret"));

  check("fake provider received both requests", captured.length === 2, `${captured.length} received`);
  for (const [i, c] of captured.entries()) {
    const everything = JSON.stringify(c.headers) + c.body;
    const label = i === 0 ? "non-streamed" : "streamed";
    check(`${label}: visitor IP not sent to provider`, !everything.includes(VISITOR_IP));
    check(`${label}: visitor cookie not sent to provider`, !everything.includes(COOKIE_MARK));
    check(`${label}: adorouter API key not sent to provider`, !everything.includes(apiKey) && !everything.includes(rawKey));
    check(`${label}: provider gets its own key`, c.headers.authorization === "Bearer capture-key");
    const risky = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip", "true-client-ip", "forwarded", "cookie", "referer", "origin"].filter((h) => h in c.headers);
    check(`${label}: no forwarding headers sent to provider`, risky.length === 0, risky.join(","));
    console.log(`      headers sent to provider: ${Object.keys(c.headers).sort().join(",")}`);
  }

  // Usage logs hold metadata only.
  await new Promise((r) => setTimeout(r, 6000));
  const logs = (await api("GET", `/api/log/?p=1&page_size=5&type=2&token_name=${name}`)).data?.items ?? [];
  check("usage logs were written", logs.length >= 2, `${logs.length} rows`);
  const logText = JSON.stringify(logs);
  check("usage logs hold no prompt", !logText.includes(CANARY));
  check("usage logs hold no visitor IP", !logText.includes(VISITOR_IP) && logs.every((l) => !l.ip));
  check("usage logs hold no network or client fingerprint", !logText.includes("client_net") && !logText.includes("client_fp"));

  // Closed routes.
  for (const path of ["/v1/images/generations", "/v1/images/edits", "/v1/videos", "/v1/video/generations", "/v1/tasks/x", "/v1/audio/speech", "/mj/submit/imagine", "/suno/submit/music", "/v1/alpha/search"]) {
    const r = await fetch(GW + path, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, prompt: CANARY }) });
    const t = await r.text();
    check(`closed: ${path}`, r.status === 404 && t.includes("ENDPOINT_NOT_AVAILABLE"), `status ${r.status}`);
  }

  // Settings.
  const options = Object.fromEntries(((await api("GET", "/api/option/")).data ?? []).map((o) => [o.key, o.value]));
  check("Creem prompt moderation is off", options.CreemModerationEnabled !== "true");
  check("Stripe text moderation is off", options.StripeTextModerationEnabled !== "true");
  check("password registration is off", options.PasswordRegisterEnabled === "false");
  const reg = await (await fetch(`${GW}/api/user/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: `p${Date.now() % 1e8}`, password: "Promise-test-1234", password2: "Promise-test-1234" }) })).json().catch(() => ({ success: false }));
  check("password sign-up is refused", reg.success === false, reg.message ?? "");
  const relogin = await jsonPost("/api/user/login", { username: ADMIN_USER, password: ADMIN_PASS }).catch(() => ({ success: false }));
  check("password login is refused", relogin.success !== true, relogin.message ?? "");

  // The website's keys use the auto group, and it must still charge the markup.
  const autoName = `promise-auto-${Date.now()}`;
  await api("POST", "/api/token/", { name: autoName, expired_time: -1, remain_quota: 0, unlimited_quota: true, group: "auto" });
  const autoId = ((await api("GET", "/api/token/?p=1&size=100")).data?.items ?? []).find((t) => t.name === autoName)?.id;
  const autoRaw = String((await api("POST", `/api/token/${autoId}/key`)).data?.key ?? "");
  const auto = await fetch(`${GW}/v1/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${autoRaw.startsWith("sk-") ? autoRaw : `sk-${autoRaw}`}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "probe" }] }) });
  await auto.text();
  check("a website key in the auto group works", auto.ok, `status ${auto.status}`);
  await new Promise((r) => setTimeout(r, 4000));
  const autoLog = ((await api("GET", `/api/log/?p=1&page_size=5&type=2&token_name=${autoName}`)).data?.items ?? [])[0];
  check("the auto group charges the +25% markup", JSON.parse(autoLog?.other ?? "{}").group_ratio === 1.25, `group_ratio ${JSON.parse(autoLog?.other ?? "{}").group_ratio}`);
  await api("DELETE", `/api/token/${autoId}`);

  // Visitors to the API's address get the website, not upstream's public pages.
  if (process.env.EXPECT_SITE_URL) {
    const home = await fetch(`${GW}/`, { redirect: "manual" });
    check("the API's address sends visitors to the website", home.status === 302 && home.headers.get("location") === process.env.EXPECT_SITE_URL, `status ${home.status}`);
    const callback = await fetch(`${GW}/oauth/discord`, { redirect: "manual" });
    check("the Discord callback page stays reachable", callback.status === 200, `status ${callback.status}`);
  }

  // No trackers in the admin console's HTML. Upstream leaves empty comments as
  // injection points, so look at what actually loads rather than at the words.
  const html = await (await fetch(`${GW}/sign-in`)).text();
  const noComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const external = [...noComments.matchAll(/<script[^>]*\bsrc=["'](https?:)?\/\/[^"']+/gi)].map((m) => m[0]);
  check("console page loads no external scripts", external.length === 0, external.join(" "));
  const trackers = ["googletagmanager", "google-analytics", "umami", "posthog", "plausible", "gtag("].filter((t) => noComments.toLowerCase().includes(t));
  check("console page has no analytics code", trackers.length === 0, trackers.join(","));

  // Nothing stored anywhere.
  if (process.env.DB_URL) {
    const require = createRequire(`${process.env.PG_MODULE_DIR}/`);
    const pg = require("pg");
    const db = new pg.Client({ connectionString: process.env.DB_URL });
    await db.connect();
    const { rows } = await db.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
    const hits = [];
    for (const { table_name: t } of rows) {
      const r = await db.query(`select count(*)::int n from "${t}" x where x::text like $1`, [`%${CANARY}%`]);
      if (r.rows[0].n > 0) hits.push(t);
    }
    await db.end();
    check(`prompt not stored in any of ${rows.length} tables`, hits.length === 0, hits.join(","));
  } else console.log("SKIP  database search (DB_URL not set)");
} catch (e) {
  check("test ran to the end", false, e.message);
} finally {
  if (tokenId) await api("DELETE", `/api/token/${tokenId}`);
  if (channelId) await api("DELETE", `/api/channel/${channelId}`);
  upstream.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
