import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";

// Never log secret values or provider response bodies.
const values = parseEnv(readFileSync(new URL("../.dev.vars", import.meta.url), "utf8"));
const names = ["ADMIN_PASSWORD", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"];
for (const name of names) {
  if (!values[name] || /REPLACE|replace-with/.test(values[name])) throw new Error(`Configure ${name} privately in .dev.vars.`);
}
if (values.ADMIN_PASSWORD.length < 16) throw new Error("ADMIN_PASSWORD must contain at least 16 characters.");
if (!/^AC[a-f0-9]{32}$/i.test(values.TWILIO_ACCOUNT_SID) || !/^VA[a-f0-9]{32}$/i.test(values.TWILIO_VERIFY_SERVICE_SID)) throw new Error("Invalid Twilio account or Verify service SID.");
const result = await fetch(`https://verify.twilio.com/v2/Services/${values.TWILIO_VERIFY_SERVICE_SID}`, {
  headers: { Authorization: "Basic " + Buffer.from(`${values.TWILIO_ACCOUNT_SID}:${values.TWILIO_AUTH_TOKEN}`).toString("base64") },
  signal: AbortSignal.timeout(15000),
});
if (!result.ok) throw new Error(`Twilio Verify service validation failed (HTTP ${result.status}). No SMS was sent.`);
const service = await result.json();
if (service.sid !== values.TWILIO_VERIFY_SERVICE_SID) throw new Error("Twilio Verify service did not match configuration.");
mkdirSync(new URL("../.wrangler/", import.meta.url), { recursive: true });
writeFileSync(new URL("../.wrangler/deploy-secrets.json", import.meta.url), JSON.stringify(Object.fromEntries(names.map(name => [name, values[name]]))), { mode: 0o600 });
console.log("Twilio Verify service validated without sending SMS. Ignored deployment secrets file prepared.");
