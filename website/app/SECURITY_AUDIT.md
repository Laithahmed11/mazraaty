# Security review — 14 October 2026

This review covers the independent Cloudflare application under `website/app` and its deployment workflows. It is a scoped code, test and dependency review, not a penetration-test certification or a guarantee against compromise. Real payments remain disabled in preview.

## Application hardening

- Read JSON bodies with streaming byte caps (4,000 for account requests; 16,000 for shared requests; 4,096 for push registration). Stop and cancel oversized streams even without Content-Length. Cap multipart photo requests at 2,200,000 bytes before parsing; the existing 2 MiB file, magic-byte, MIME and admin checks remain.
- Keep the device and IP booking budgets and add a normalized-phone budget, hashed in the rate-limit table. Deleting and re-verifying the same phone no longer resets its 15-per-day budget. The scheduled worker removes expired throttle entries. No plaintext phone is added to throttle storage.
- Recheck photo publication or admin authorization on every origin request and return no-store even for public farm photos, so future publication changes are not delayed by newly cached responses. This cannot revoke images already downloaded or previously cached under the older policy.
- Limit browser connections and images to the app origin, retaining data/blob local previews and font hosts. Disallow object embedding and use no-referrer on external payment navigation. Inline scripts/styles remain permitted for the framework bootstrap; replacing these with a tested nonce policy is a further defense-in-depth task.
- Reject redirects for Twilio and Firebase credential-bearing requests, as already done for Wayl. Keep provider HMAC checks, independent merchant-side status/amount/reference verification, ownership checks and atomic slot/payment transitions.
- Separate CI build/check and deploy runners. No Cloudflare token is supplied to dependency installation, tests, builds or configuration. The deploy runner installs fresh frozen dependencies with lifecycle scripts disabled and uses the token only for migration/deployment of the validated bundle. Backup installation also runs without the Cloudflare token. Workflow action references still use trusted publisher version tags; immutable action pinning remains further supply-chain hardening.

The body-limit and account-budget regressions failed against the old implementation, then passed after repair. The product suite now includes 28 tests (519 assertions), covering private administration, cross-account booking/payment access, verified identity, R2 privacy, provider redirects/replay, cancellation, late payment, concurrent slots, 8% fee calculation and the new abuse cases. Typecheck and the full build passed. A fresh local D1/Worker smoke check passed (including SSR, R2 bytes, no-store photos and response headers), as did the no-bundle preview deployment dry run. The patched native Sharp resolution processed a synthetic PNG locally; the new CI check will also exercise this on Linux. These checks do not exercise every possible attack.

An additional read-only Codex CLI review was attempted on a sanitized snapshot, but its execution policy prevented reading files. It was incomplete and is not counted as a clean review. The user chose to proceed with the completed independent reviews and product/integration checks.

## Dependency remediation

The 13 October audit had 21 package names with findings. Seroval was updated from 1.5.4 to a pinned compatible 1.6.9 override because it is on TanStack's runtime serialization path ([advisory](https://github.com/advisories/GHSA-p6vx-979v-rg4c), [advisory](https://github.com/advisories/GHSA-jp82-f5mq-hwhp)).

On 14 October, `bun audit fix` refreshed the compatible lock entries for proxy-addr, MCP SDK, Hono/node-server, Undici, fast-uri, ip-address, qs, browserslist/baseline mapping, brace-expansion, PostCSS/selector-parser, source-map-js, js-yaml, Nano ID and Vitest. Vitest and its exact companion packages now resolve together to 4.1.11. Framework majors were retained.

Sharp 0.35.5 is an explicitly reviewed patch override of Miniflare's exact 0.35.4 pin; the lock resolves native Sharp companions to 0.35.5 and libvips companions to 1.3.4. It addresses the [Sharp/librsvg advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). Node22 fits the [official package requirements](https://github.com/lovell/sharp/blob/v0.35.5/package.json). This belongs to local Miniflare image tooling; uploaded-photo validation alone does not mitigate it. No Images binding or cf.image processing is used by the product. Keep this override until the upstream Wrangler/Miniflare pin is corrected, and verify local/native tooling and Linux CI when changing it.

The fresh native audit now reports **one** remaining package/advisory: `braces@3.0.3`, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). It has no published fixed version. Its path is shadcn/ts-morph → fast-glob → micromatch, used in tooling; customer input does not reach this glob parser. The inspected readable Worker bundle contains no region for braces or any of the 20 originally deferred packages. This is evidence for this bundle, not a universal proof of reachability.

The shadcn package has an active CSS import that resolves directly to tailwind.css; that does not execute its MCP/Express CLI dependency tree. MCP's advisory concerns HTTP OAuth clients, not simply exposing its server. Miniflare's own Undici copy was already patched; the other vulnerable Undici copy belonged to CLI tooling.

## Enforced review boundary

`bun run audit:security` runs a fresh native JSON audit and preserves the report privately under `.wrangler`. Every new advisory, malformed/unavailable audit, or expired exception fails the check. The only temporary exception is the exact braces advisory above, through **20 October 2026**; it is not a blanket high-severity exemption. This date is a build gate, not a scheduled reminder. Re-review its path and upstream fix before extending it. Both Cloudflare check and deploy build workflows enforce the gate.

Before a paid/public launch: disable preview demo authentication, activate verified SMS privately, finish the merchant branding/refund/link-revocation operational checks, protect owner/cloud accounts with MFA, and repeat dependency/runtime and physical-device acceptance checks. Never copy private environment files, tokens, signing material, customer SQL or screenshots into Git.
