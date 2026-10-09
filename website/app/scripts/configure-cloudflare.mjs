import { readFileSync, writeFileSync } from "node:fs";

// Generate an ignored deployment config. Local bindings stay isolated.
const id = process.env.CLOUDFLARE_D1_DATABASE_ID;
if (!id || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) || id === "00000000-0000-0000-0000-000000000000") {
  throw new Error("Set CLOUDFLARE_D1_DATABASE_ID to the UUID of the NEW mazraaty-db database.");
}
const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
config.d1_databases[0].database_id = id;
config.vars = { ...config.vars, REQUIRE_PHONE_AUTH: "true", APP_ENV: "production" };
writeFileSync(new URL("../wrangler.deploy.jsonc", import.meta.url), JSON.stringify(config, null, 2) + "\n");
console.log("Prepared independent mazraati Worker config (mazraaty-db / mazraaty-photos).");
