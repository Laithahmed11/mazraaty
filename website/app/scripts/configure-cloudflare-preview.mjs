import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes, randomInt } from "node:crypto";
const base = new URL("../", import.meta.url);
const id = process.env.CLOUDFLARE_PREVIEW_D1_DATABASE_ID;
if (!id || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) || /^0{8}(-0{4}){3}-0{12}$/.test(id)) throw new Error("Set the NEW preview D1 database UUID.");
if (existsSync(new URL("wrangler.deploy.jsonc", base))) {
  const production = JSON.parse(readFileSync(new URL("wrangler.deploy.jsonc", base), "utf8"));
  if (production.d1_databases[0].database_id === id) throw new Error("Preview must use a separate D1 database.");
}
const config = JSON.parse(readFileSync(new URL("wrangler.jsonc", base), "utf8"));
config.name = "mazraati-preview";
config.d1_databases = [{ binding: "DB", database_name: "mazraaty-preview-db", database_id: id, migrations_dir: "migrations" }];
config.r2_buckets = [{ binding: "STORAGE", bucket_name: "mazraaty-preview-photos" }];
config.vars = { APP_ENV: "preview", REQUIRE_PHONE_AUTH: "true", DEMO_AUTH_HOST: "mazraati-preview.laithlaith500.workers.dev", DEMO_AUTH_PHONE: "+9647700000000" };
const previousPath=new URL('wrangler.preview.jsonc',base);
if(existsSync(previousPath)){
 const previous=JSON.parse(readFileSync(previousPath,'utf8'));
 if(previous.name==='mazraati-preview'&&previous.d1_databases?.[0]?.database_id===id&&/^[a-z][a-z0-9-]{4,62}$/.test(previous.vars?.FCM_PROJECT_ID||'')){
  config.vars.FCM_PROJECT_ID=previous.vars.FCM_PROJECT_ID;
  if(previous.vars.PUSH_ENABLED==='true')config.vars.PUSH_ENABLED='true';
 }
}
writeFileSync(new URL("wrangler.preview.jsonc", base), JSON.stringify(config, null, 2) + "\n");
mkdirSync(new URL(".wrangler/", base), { recursive: true });
const secretsPath = new URL(".wrangler/preview-secrets.json", base);
if (!existsSync(secretsPath)) writeFileSync(secretsPath, JSON.stringify({ ADMIN_PASSWORD: randomBytes(32).toString("base64url"), DEMO_AUTH_CODE: String(randomInt(100000, 1000000)) }), { mode: 0o600 });
const secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
writeFileSync(new URL(".wrangler/preview-access.local", base), `نسخة فحص فقط؛ لا SMS ولا توثيق حقيقي للهواتف.\nرابط الزبون: https://${config.vars.DEMO_AUTH_HOST}/customer\nرابط الإدارة: https://${config.vars.DEMO_AUTH_HOST}/owner\nرقم التجربة الوحيد: 07700000000\nرمز الدخول التجريبي: ${secrets.DEMO_AUTH_CODE}\nكلمة إدارة نسخة الفحص: ${secrets.ADMIN_PASSWORD}\n`, { mode: 0o600 });
console.log("Isolated preview config and ignored access files prepared. No secret values displayed.");
