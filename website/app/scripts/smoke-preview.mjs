import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const config = JSON.parse(readFileSync(new URL("../wrangler.preview.jsonc", import.meta.url), "utf8"));
assert.equal(config.name, "mazraati-preview");
assert.equal(config.d1_databases[0].database_name, "mazraaty-preview-db");
assert.equal(config.vars.APP_ENV, "preview");
const origin = `https://${config.vars.DEMO_AUTH_HOST}`;
const secrets = JSON.parse(readFileSync(new URL("../.wrangler/preview-secrets.json", import.meta.url), "utf8"));
const call = (path, method = "GET", value, cookie = "") => fetch(origin + "/api/v2/" + path, {
  method, headers: { Origin: origin, Cookie: cookie },
  body: value === undefined ? undefined : value instanceof FormData ? value : JSON.stringify(value),
  signal: AbortSignal.timeout(20000),
});
const status = await call("account/status");
assert.equal(status.status, 200);
assert.equal((await status.json()).demo, true, "Refuse to test a non-demo deployment");
for (const path of ["/customer", "/owner"]) {
  const page = await fetch(origin + path);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("نسخة تجريبية للفحص فقط"));
}
assert.equal((await call("owner/farms")).status, 401);
assert.equal((await call("bookings")).status, 401);
assert.equal((await call("account/start", "POST", { phone: "07711111111" })).status, 400);
const started = await call("account/start", "POST", { phone: "07700000000" });
assert.equal(started.status, 200);
const start = await started.json();
assert.equal(start.sent, false); assert.equal(start.demo, true);
const challenge = started.headers.get("set-cookie").split(";")[0];
assert.equal((await call("account/check", "POST", { code: "000000" }, challenge)).status, 400);
const checked = await call("account/check", "POST", { code: secrets.DEMO_AUTH_CODE }, challenge);
assert.equal(checked.status, 200);
const customerCookie = checked.headers.get("set-cookie").split(";")[0];
assert.equal((await call("owner/farms", "POST", {}, customerCookie)).status, 401);
const logged = await call("login", "POST", { password: secrets.ADMIN_PASSWORD });
assert.equal(logged.status, 200);
const adminCookie = logged.headers.get("set-cookie").split(";")[0];
const form = new FormData();
form.set("file", new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=", "base64")], "preview-test.png", { type: "image/png" }));
const uploaded = await call("owner/photos", "POST", form, adminCookie);
assert.equal(uploaded.status, 201);
const { url } = await uploaded.json();
assert.equal((await fetch(origin + url)).status, 401);
assert.equal((await fetch(origin + url, { headers: { Cookie: adminCookie } })).status, 200);
const farmResponse = await call("owner/farms", "POST", { name: "مزرعة تجريبية — للفحص فقط", region: "بغداد", area: "بيانات تجريبية", description: "مثال جديد لفحص الحجز الصباحي والمسائي. ليس إعلان مزرعة حقيقية.", price: 100000, eveningPrice: 150000, capacity: 10, amenities: "تجربة فقط", images: ["/assets/standalone-farm.svg", url], published: true }, adminCookie);
assert.equal(farmResponse.status, 201);
const { farm } = await farmResponse.json();
assert.equal((await fetch(origin + url)).status, 200);
const date = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
for (const period of ["morning", "evening"]) {
  const booked = await call("bookings", "POST", { farmId: farm.id, date, period, guests: 2, name: "حساب التجربة", phone: "07711111111", notes: "حجز اختبار فقط", requestId: crypto.randomUUID() }, customerCookie);
  assert.equal(booked.status, 201);
  const { booking } = await booked.json();
  assert.equal(booking.phone, config.vars.DEMO_AUTH_PHONE);
  assert.equal((await call("owner/bookings/" + booking.id, "PATCH", { status: "confirmed" }, adminCookie)).status, 200);
  if (period === "morning") assert.equal((await call("bookings/" + booking.id + "/cancel", "POST", {}, customerCookie)).status, 200);
}
assert.equal((await call("account/logout", "POST", {}, customerCookie)).status, 200);
assert.equal((await call("bookings", "GET", undefined, customerCookie)).status, 401);
console.log("PASS: isolated preview demo login, wrong-code denial, admin ownership, private/public R2 and independent morning/evening bookings. No SMS sent.");
