# Independent MAZRAATI Cloudflare deployment

This checkout deploys directly to a new Worker named `mazraati`, D1 database
`mazraaty-db` (binding `DB`) and private R2 bucket `mazraaty-photos` (binding
`STORAGE`). It does not use the Higgsfield project deployment service. No old
farms, bookings, accounts, sessions or uploaded photos are imported. Do not point
the configuration at Higgsfield resources or change the existing site's DNS.

## Local validation (no account needed)

Requires Node.js 22+ and Bun 1.4.2. From `website/app`:

Dependencies use Bun's hoisted linker to avoid long isolated-store paths on Windows.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test:product
bun run build
bun run db:local
bun run cf:dry-run
bun run test:worker
bun run dev:worker
```

`wrangler.jsonc` uses a zero UUID for local D1 and local R2 emulation. It never
sets `remote: true`. `vite dev` by itself runs in Node and cannot provide the
Worker bindings; use the built Worker through `dev:worker`. `.dev.vars.example`
contains placeholders only; set private local secrets in ignored `.dev.vars`.

The complete migration sequence is `0001_init.sql` (executable `SELECT 1` no-op),
`0001_shared_mazraaty.sql`, `0002_booking_periods.sql`, `0003_phone_accounts.sql`.
Wrangler records applied filenames, so the two distinct `0001_...` names do not
collide. The period migration rebuilds the reservation table and retains legacy
full-day blocking. Do not manually replay applied migrations, alter their history
or use an existing production database as a test target.

`bun run test` also runs old scaffold contracts. Its documented unused
ScrollScrub/home assertion still fails; required CI uses the product suite and
does not restore the template home.

## New account resources (pending user authorization / account access)

No Cloudflare account is configured by this commit. After the user approves
Cloudflare login and any R2 billing activation, run using the chosen account:

```sh
bunx wrangler login
bunx wrangler whoami
bunx wrangler d1 create mazraaty-db
bunx wrangler r2 bucket create mazraaty-photos
```

Confirm both resources are newly created and empty; if either name already
exists, stop and inspect it rather than reuse it blindly. Save the NEW D1 UUID
as `CLOUDFLARE_D1_DATABASE_ID`. Keep R2 private; no public bucket URL or CORS
configuration is needed. The server writes UUID photo keys and serves them at
same-origin `/api/v2/photos/<uuid>.<ext>`. Upload requires an admin session;
unpublished images require admin access and have `no-store`, while images on
published farms are public and cached for five minutes.
Published-photo access uses exact JSON array membership in D1, rather than a
`LIKE` pattern (the complete UUID photo path exceeds D1's pattern limit).

## GitHub deployment

Pushes and pull requests run `.github/workflows/cloudflare-checks.yml` only.
Deployment uses **manual** `workflow_dispatch` in `cloudflare-deploy.yml` and
never runs on push. Before running it, configure the GitHub environment
`cloudflare-new` with required reviewers and restrict it to the intended branch:

The manual workflow must first be present on the repository's default branch to
appear in GitHub's Actions UI. A migration branch can run checks on push and be
reviewed/merged before any manual deployment is requested.

- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Variable: `CLOUDFLARE_D1_DATABASE_ID` for the newly created database.
- Optional variable: `VITE_PUBLIC_SITE_URL`, the new HTTPS Worker URL/domain.
  If unset, pages omit canonical links rather than retain the Higgsfield URL.

Use an account-scoped token with Workers Scripts Edit, D1 Edit and Workers R2
Storage Edit. No zone permission is needed for this workers.dev-only deployment.
The workflow validates/builds, generates ignored `wrangler.deploy.jsonc`, applies
migrations to the new D1 database, then deploys the new Worker and static assets.
It does not import data or update an existing Higgsfield Worker or custom domain.
Do not run the manual deployment until the new resources/account are verified.

Set runtime secrets **privately in Cloudflare**, before opening the new app to
customers. Configure `ADMIN_PASSWORD` (unique, at least 16 characters) and
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` on the new
Worker via its settings or `wrangler secret put NAME --config wrangler.deploy.jsonc`.
Never place their values in GitHub source or public `VITE_*` variables. Verified
phone sign-in needs all Twilio values; the generated independent deployment
blocks customer account and booking actions until they are configured. Payments remain
disabled. No Android/iOS wrapper URLs or current production traffic are switched
in this phase.

The generated independent deployment config sets `REQUIRE_PHONE_AUTH=true`.
It blocks booking, cancellation and device-account requests with HTTP 503 if
Twilio credentials are missing, rather than allowing unverified device accounts.
For an authorized first deployment from this computer, fill the ignored
`.dev.vars` privately, run `node scripts/prepare-cloudflare-secrets.mjs` to
validate the Verify service without sending an SMS, then deploy with
`wrangler deploy --config wrangler.deploy.jsonc --secrets-file .wrangler/deploy-secrets.json`.
The ignored JSON file contains real secrets; never print, attach or commit it.

References: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/),
[R2 bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/),
[D1 pattern limits](https://developers.cloudflare.com/d1/platform/limits/).

## Isolated demo preview (no SMS)

The user-authorized demo runs on `mazraati-preview` with separate D1
`mazraaty-preview-db` and private R2 `mazraaty-preview-photos`. No launch database
or Higgsfield data is imported. Only the synthetic account `07700000000` may
sign in using an owner-held six-digit demo code. This does not verify ownership
of a real phone number. The UI labels the environment and login as a demo.

Set `CLOUDFLARE_PREVIEW_D1_DATABASE_ID` to the NEW preview UUID, then run
`node scripts/configure-cloudflare-preview.mjs`. It generates ignored
`wrangler.preview.jsonc`, `.wrangler/preview-secrets.json` and the private user
handoff file `.wrangler/preview-access.local` without printing secret values.
Build with `VITE_APP_ENV=preview`, apply migrations using
`wrangler d1 migrations apply DB --remote --config wrangler.preview.jsonc`,
then deploy with `wrangler deploy --config wrangler.preview.jsonc --secrets-file .wrangler/preview-secrets.json`.

Demo authentication requires `APP_ENV=preview`, the exact `DEMO_AUTH_HOST`,
configured synthetic `DEMO_AUTH_PHONE`, and secret `DEMO_AUTH_CODE`. It never
calls Twilio. It retains rate limits, single-use challenges, secure sessions,
admin checks and booking ownership. The production config sets
`APP_ENV=production`; demo login is denied there even if demo secrets are set.
Never copy preview accounts or bookings into the launch database. Rebuild
without `VITE_APP_ENV=preview` and use verified Twilio accounts for launch.
