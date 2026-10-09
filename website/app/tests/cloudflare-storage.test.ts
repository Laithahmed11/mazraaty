import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { handleShared, type SharedEnv } from "../src/lib/shared-api.server";

class LocalDB {
  raw = new Database(":memory:");
  constructor() {
    // Match Wrangler's complete migration discovery, including the inert scaffold.
    for (const file of readdirSync("migrations").filter(f => f.endsWith(".sql")).sort()) {
      this.raw.exec(readFileSync(`migrations/${file}`, "utf8"));
    }
  }
  prepare(sql: string) {
    const raw = this.raw;
    let args: any[] = [];
    return {
      bind(...values: any[]) { args = values; return this; },
      async first() { return raw.prepare(sql).get(...args); },
      async all() { return { results: raw.prepare(sql).all(...args) }; },
      async run() { return { meta: { changes: raw.prepare(sql).run(...args).changes } }; },
    };
  }
}

test("all migrations create an empty database without farms, bookings, accounts or sessions", () => {
  const db = new LocalDB();
  try {
    for (const table of ["farms", "bookings", "customers", "sessions", "customer_sessions", "phone_challenges", "devices", "reserved_dates"]) {
      expect(db.raw.query(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
    expect(db.raw.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    expect(db.raw.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally { db.raw.close(); }
});

test("R2 photo upload, private preview, published access and hidden-farm privacy", async () => {
  const db = new LocalDB();
  const objects = new Map<string, { bytes: Uint8Array; httpMetadata: { contentType: string } }>();
  const storage = {
    async put(key: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string } }) {
      objects.set(key, { bytes, httpMetadata: options.httpMetadata });
    },
    async get(key: string) {
      const item = objects.get(key);
      return item ? { body: item.bytes, httpMetadata: item.httpMetadata } : null;
    },
  };
  const env = { DB: db, STORAGE: storage, ADMIN_PASSWORD: "local-test-only-password" } as unknown as SharedEnv;
  const origin = "https://test.mazraaty.invalid";
  const call = (path: string, method = "GET", body?: BodyInit, cookie = "") => handleShared(
    new Request(`${origin}/api/v2/${path}`, { method, body, headers: { Origin: origin, Cookie: cookie } }), env,
  );
  const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=", "base64"));
  const upload = (cookie = "", type = "image/png", bytes = png) => {
    const form = new FormData();
    form.set("file", new File([bytes], type === "image/jpeg" ? "test.jpg" : "test.png", { type }));
    return call("owner/photos", "POST", form, cookie);
  };
  try {
    expect((await call("catalog")).status).toBe(200);
    expect(await (await call("catalog")).json()).toEqual({ farms: [] });
    expect((await upload()).status).toBe(401);
    expect(objects.size).toBe(0);
    const login = await call("login", "POST", JSON.stringify({ password: env.ADMIN_PASSWORD }));
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    expect((await upload(cookie, "image/jpeg")).status).toBe(400);
    expect((await upload(cookie, "image/png", new Uint8Array(2097153))).status).toBe(400);
    const photo = await upload(cookie);
    expect(photo.status).toBe(201);
    const { url } = await photo.json() as { url: string };
    expect(url).toMatch(/^\/api\/v2\/photos\/[a-f0-9-]{36}\.png$/);
    expect(objects.size).toBe(1);
    const path = url.replace("/api/v2/", "");
    expect((await call(path)).status).toBe(401);
    const privatePhoto = await call(path, "GET", undefined, cookie);
    expect(privatePhoto.status).toBe(200);
    expect(privatePhoto.headers.get("Cache-Control")).toBe("no-store");
    const input = { name: "اختبار", region: "بغداد", area: "اختبار", description: "اختبار", price: 100000, eveningPrice: 150000, capacity: 10, amenities: "", images: [url], published: true };
    const farm = await call("owner/farms", "POST", JSON.stringify(input), cookie);
    expect(farm.status).toBe(201);
    const saved = await farm.json() as { farm: { id: string } };
    const publicPhoto = await call(path);
    expect(publicPhoto.status).toBe(200);
    expect(publicPhoto.headers.get("Content-Type")).toBe("image/png");
    expect(publicPhoto.headers.get("Cache-Control")).toBe("public,max-age=300");
    expect(new Uint8Array(await publicPhoto.arrayBuffer())).toEqual(png);
    expect((await call("owner/farms/" + saved.farm.id, "DELETE", undefined, cookie)).status).toBe(200);
    expect((await call(path)).status).toBe(401);
    expect((await call("photos/" + crypto.randomUUID() + ".png", "GET", undefined, cookie)).status).toBe(404);
  } finally { db.raw.close(); }
});
