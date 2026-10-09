import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

// All storage is a fresh ignored local state directory; no remote resources.
const cli = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
// Keep the state path short: workerd's SQLite files hit Windows path limits
// when this repository's long directory is combined with a full UUID folder.
let state;
do { state = `.wrangler/${randomUUID().slice(0, 4)}`; } while (existsSync(state));
mkdirSync(state, { recursive: true });
const migration = spawnSync(process.execPath, [cli, "d1", "migrations", "apply", "DB", "--local", "--persist-to", state], { stdio: "inherit", env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" } });
assert.equal(migration.status, 0, "Local D1 migrations must succeed");
// Reapplying through Wrangler must be a tracked no-op.
const replay = spawnSync(process.execPath, [cli, "d1", "migrations", "apply", "DB", "--local", "--persist-to", state], { stdio: "inherit", env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" } });
assert.equal(replay.status, 0);
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const password = randomUUID(); // disposable local test credential
let logs = "";
const worker = spawn(process.execPath, [cli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--persist-to", state, "--var", `ADMIN_PASSWORD:${password}`], { env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
worker.stdout.on("data", chunk => { logs += chunk; });
worker.stderr.on("data", chunk => { logs += chunk; });
const origin = `http://127.0.0.1:${port}`;
const call = (path, method = "GET", body, cookie = "") => fetch(`${origin}/api/v2/${path}`, { method, body, headers: { Origin: origin, Cookie: cookie } });
try {
  let ready = false;
  for (let n = 0; n < 120; n++) {
    if (worker.exitCode !== null) throw new Error("Worker exited before becoming ready");
    try { if ((await call("health")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Worker must start with local bindings");
  assert.deepEqual(await (await call("catalog")).json(), { farms: [] });
  for (const route of ["/", "/customer", "/owner"]) {
    const page = await fetch(origin + route);
    assert.equal(page.status, 200, route);
    const html = await page.text();
    assert.ok(html.includes("مزرعتي"), "Product SSR must render");
    assert.ok(!html.includes("mazraaty-iraq.higgsfield.app"));
  }
  const login = await call("login", "POST", JSON.stringify({ password }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=", "base64");
  const upload = (session = "") => {
    const form = new FormData();
    form.set("file", new File([png], "local-test.png", { type: "image/png" }));
    return call("owner/photos", "POST", form, session);
  };
  assert.equal((await upload()).status, 401);
  const uploaded = await upload(cookie);
  assert.equal(uploaded.status, 201);
  const { url } = await uploaded.json();
  const photoPath = url.replace("/api/v2/", "");
  assert.equal((await call(photoPath)).status, 401);
  const privatePhoto = await call(photoPath, "GET", undefined, cookie);
  assert.equal(privatePhoto.status, 200);
  assert.equal(privatePhoto.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await privatePhoto.arrayBuffer()), png);
  const input = { name: "اختبار محلي", region: "بغداد", area: "اختبار", description: "اختبار", price: 100000, eveningPrice: 150000, capacity: 10, amenities: "", images: [url], published: false };
  const farmResponse = await call("owner/farms", "POST", JSON.stringify(input), cookie);
  assert.equal(farmResponse.status, 201);
  const { farm } = await farmResponse.json();
  assert.equal((await call("owner/farms/" + farm.id, "PATCH", JSON.stringify({ ...input, published: true, revision: farm.revision }), cookie)).status, 200);
  const publicPhoto = await call(photoPath);
  if (!publicPhoto.ok) throw new Error(`Public R2 photo failed: ${publicPhoto.status} ${await publicPhoto.text()}`);
  assert.equal(publicPhoto.status, 200);
  assert.equal(publicPhoto.headers.get("content-type"), "image/png");
  assert.equal(publicPhoto.headers.get("cache-control"), "public,max-age=300");
  assert.deepEqual(Buffer.from(await publicPhoto.arrayBuffer()), png);
  assert.equal((await call("owner/farms/" + farm.id, "DELETE", undefined, cookie)).status, 200);
  assert.equal((await call(photoPath)).status, 401);
  console.log("PASS: built Worker SSR, empty/tracked D1 migrations, admin upload and private/public R2 photo bytes.");
} catch (error) {
  await new Promise(resolve => setTimeout(resolve, 300));
  console.error(logs.replaceAll(password, "[local-test-credential]"));
  throw error;
} finally {
  worker.kill();
}
