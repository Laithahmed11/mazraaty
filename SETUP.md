# Setup and continuation

## Website / backend

Requires Git, Node.js 22 or newer and Bun (tested with Bun 1.4.2).

```sh
cd website/app
bun install --frozen-lockfile
bun run typecheck
bun test tests/shared-service.test.ts tests/customer-auth.test.ts
bun run build
```

The full scaffold includes old template tests; `landing-contract.test.ts` still expects the original ScrollScrub home route and has one known failing assertion on this adapted farm app. The product tests above passed with 92 assertions on the source snapshot. Do not replace the product home with the scaffold merely to satisfy that assertion.

This is a Cloudflare Worker application using TanStack Start. Plain Node SSR alone does not provide `cloudflare:workers` bindings. Configure a local Cloudflare development environment using `wrangler.jsonc` and provision local D1 binding `DB` and R2 binding `STORAGE`. The checked-in wrangler configuration contains placeholders. Apply migrations `0001_shared_mazraaty.sql`, `0002_booking_periods.sql` and `0003_phone_accounts.sql` to a **local test database**, in order. Do not run destructive migrations against production.

Copy `.dev.vars.example` to `.dev.vars` only in a local environment. Set actual values privately; never commit this file. Production secrets belong in Higgsfield project settings:

- `ADMIN_PASSWORD`: a unique administration password, at least 16 characters.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`: your Twilio Verify account/service credentials. Without configured phone authentication, the server retains legacy device-scoped bookings. Test-only Twilio accounts can send only to approved tester numbers.

The site is independent of Wix. Payment through QI remains deferred; confirmation does not charge a customer.

GitHub push does not update the running Higgsfield site. To deploy there, use its project checkout/push/deploy workflow against the original project. Do not create a replacement project or expose the administration secret in client code.

## Android

Requires JDK, Bash (Linux, macOS or WSL on Windows), Android SDK platform android-35 and build-tools 35.0.0. Set `ANDROID_SDK_ROOT`, then run:

```sh
cd android
bash customer/build.sh
bash owner/build.sh
```

These are WebView wrappers for the same hosted customer/admin site. Server UI changes load on reopening with internet. Shell changes require rebuilding the APK. No signing keys are included; a freshly generated debug key cannot update an installed APK signed with the original key. Keep the original key privately if an in-place update is needed, or use a separate test installation. Use separately secured production signing for store releases.

## iOS source status and remaining work

Open `ios-legacy/Mazraaty.xcodeproj` on a Mac using Xcode supporting iOS 17 or newer. The checked-in project has no Apple signing credentials and its service URL is a placeholder. A simulator can be used before paid store membership; device/store signing requires configuring your own Apple team.

The SwiftUI source predates the independent booking backend. Its existing models and API client use `/api/v1`, Wix-specific fields and legacy per-device tokens. Before claiming it works with the current product:

1. Adapt `APIClient.swift` and `Models.swift` to `website/app/src/lib/shared-api.server.ts` and `customer-auth.server.ts` (`/api/v2`).
2. Add morning/evening selection and period prices; evening belongs to its start date and ends at 04:00 the next morning.
3. Implement verified phone sign-in, secure cookie/session handling, cross-device booking history and logout. Do not grant account access from a typed phone number alone.
4. Preserve owner-only administration and validate calendar availability and cancellation.
5. Test with Xcode and a real device; update privacy declarations to match the final implementation.

There is no compiled IPA, successful Xcode build, TestFlight release or App Store publication in this snapshot.
