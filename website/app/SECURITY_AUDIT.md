# Dependency audit triage — 13 October 2026

`bun audit --json` was run against the existing Bun lockfile during payment/WhatsApp preparation. It reported advisories in 21 package names; it was not clean. No new service SDK dependency was added by this feature.

## Runtime correction

Seroval 1.5.4 is used by TanStack's serialization path. Updated to a pinned 1.6.9 override within the supported 1.x peer ranges; only its lockfile entry and override changed. Its critical/high advisories no longer appear after installation. Lifecycle scripts were disabled for the update; the package has no install/postinstall script.

References:
- https://github.com/advisories/GHSA-p6vx-979v-rg4c
- https://github.com/advisories/GHSA-jp82-f5mq-hwhp

## Remaining findings: deferred tooling follow-up

20 other package names still have findings. This is an initial reachability triage, not a claim of a complete security audit or approval for real payments.

| Group | Current path / reason for deferral |
| --- | --- |
| proxy-addr, MCP SDK, Hono, related undici | Primarily the unused shadcn CLI/MCP/Express tooling dependency tree (`bun pm why`). The product serves Cloudflare Worker routes; it does not run the shadcn MCP server or Express behind proxy trust. Do not expose this CLI as a service. |
| sharp | Miniflare development tooling, not the uploaded-photo runtime. App uploads accept JPEG/PNG/WebP magic bytes and reject SVG; local tooling is bound to loopback. Upgrade the compatible Wrangler/Miniflare tree before any image-processing tooling is exposed to untrusted files. |
| browserslist, baseline-browser-mapping, braces, brace-expansion, postcss, postcss-selector-parser, source-map-js, js-yaml | Build-time parsing of project-controlled CSS/configuration/patterns. No customer-uploaded stylesheet, source map, YAML or glob is parsed by product routes. Plan a compatible build-tool update rather than forced blanket overrides. |
| fast-uri, ip-address, qs | Transitive CLI/development schema/network parsers; do not add arbitrary URL import, proxy-trust or public development servers without reassessing these paths. |
| nanoid | No product route accepts a generator size; product booking/account identifiers use Web Crypto, and numeric user inputs are bounded server-side. Review the exact framework call paths when updating the dependency tree. |
| vitest, @vitest/mocker | Original template/testing tools; product checks run with Bun. Do not expose test UI/dev servers. |

Review again by 20 October 2026 and before any paid launch. That is a documented review date, not an active reminder or scheduled audit. Re-run the native audit after compatible updates and before enabling the merchant adapter. The preparation remains unable to charge or send payment WhatsApp messages on preview.
