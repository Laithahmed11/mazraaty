# Launch readiness — 10 October 2026

The Android preview has received offers and booking-created/confirmed/cancelled notifications on the owner's phone. It is not a store release. No store account or production SMS service is available yet. iOS remains an older untested implementation and requires a Mac.

## Implemented preparation

- The customer brand/header remains shared across Explore, Favorites and Bookings. The compact discovery banner appears only in Explore; the other tabs begin directly with their content. Account, push preferences and account deletion are accessible from the header.
- Existing favorites/search/region/price/capacity/service filters remain. Ratings are stars only, after the verified account's confirmed booking has ended in Baghdad time; cancellation/rejection and another account cannot rate.
- Public `/privacy`, `/terms`, `/support`, `/delete-account` pages; immediate in-app deletion and an external email request path. Published contact information is the existing operator contact. The operator must actually meet the stated response/deletion deadlines.
- Android targets API 36 with a configurable exact host and guarded private signing for AAB release. No upload key or store credentials are committed. Existing preview APKs must be rebuilt to update native code.
- A permanent upload key was generated and verified locally in ignored `android/.private-signing/`. It has not been uploaded anywhere. Preserve the entire folder privately off-device before release. `android/build-release.ps1 -LaunchHost YOUR_DOMAIN` reads the private local signing configuration without printing it and refuses to build before launch credentials/pages pass.
- Cloudflare observability is enabled. `scripts/backup-d1.mjs` exports only to ignored private files with 30-day retention on subsequent runs; it is not an off-device or scheduled backup until configured. R2 remains private. D1 restore must preserve deletion requests.

## Required before launch (not replaceable by code)

1. Activate the operator's Twilio Verify SMS account, enable Iraq as appropriate, set secrets privately on `mazraati`, and verify a real Iraqi number through sign-in/check/logout. Paid activation requires operator approval. No test SMS bypass on production.
2. Review contact details, policies, pricing/cancellation terms and privacy disclosures as the actual operator. Set the final HTTPS domain. Launch pages must remain publicly accessible and HTTPS.
3. Prepare launch FCM credentials (the existing key is installed only on preview), set push vars/secrets on launch, apply additive migrations to the independent launch DB, build without preview mode, then run `LAUNCH_SITE_URL=https://YOUR_DOMAIN bun scripts/check-launch.mjs`. Do not copy test accounts, photos, ratings or bookings.
4. Generate and preserve a private permanent upload keystore outside Git, enable Play App Signing, and supply private signing variables to `android/build-release.sh`. Never upload a debug APK. Verify bundles/signatures and final hostname, and run device checks again against launch.
5. Create/verify Google Play developer account and package registrations. Complete store listing, screenshots taken from the final app, content rating, ads declaration (no ads SDK), app access instructions for reviewer, Data safety and privacy/account-deletion URLs. Do not give public admin access. Prefer distributing the owner app privately.
6. If the new personal account requires closed testing, complete the Play Console testing period and tester count before applying for production access. Approval is Google's decision.
7. Add real farms only after launch configuration passes. Preview and launch use separate D1/R2. Confirm morning/evening booking conflict, R2 upload/display, confirmed cancellation, phone ownership and account deletion.
8. Test reminders at the real Baghdad boundary, denied notification permission, disabled offers, logout, session expiry, deep-link tap and offline/retry on physical phones. Existing automated security tests do not prove OS delivery.
9. Configure an off-device private backup destination and daily scheduled export without storing databases in GitHub artifacts. D1 Time Travel and an R2 copy policy need review in the actual account. Before restoration, export current `deletion_ledger` and apply its principals to restored devices, bookings, sessions and ratings so deletion is not undone. Test restore on a NEW isolated DB only. Never automatically overwrite launch.
10. In Cloudflare configure an uptime alert for `/api/v2/health` and error alerts; review Worker logs without logging passwords/tokens/request bodies. A monitoring file alone is not an active alert subscription.

## Draft Play Data safety mapping (operator must verify)

| Data | Purpose | Handling |
| --- | --- | --- |
| Phone number | Account verification and booking contact | Cloudflare / Twilio verification processing |
| Name, booking details and optional notes | Booking management | Private administration; necessary farm coordination |
| Account/session and Firebase installation/token identifiers | Authentication, notification delivery | Cloudflare / Firebase processing; offers require separate opt-in |
| Ratings | Product features | Public aggregate stars, no public name or comment |
| Farm photos | Catalog | Owner-selected files, published only with the farm |

Declare collection even if data is optional. Classify provider processing and sharing according to Play's definitions and actual agreements, not merely this table. No payment, contact-list, precise-location or advertising-ID collection is implemented. Inspect Firebase's SDK disclosure for the exact shipped version. Deletion removes the account and personal booking fields; anonymous reservation records remain. Backup retention is at most 30 days only if the run/retention policy is operated as described.

## Official requirements checked

- [Target API](https://developer.android.com/google/play/requirements/target-sdk)
- [Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465)
- [User Data and privacy](https://support.google.com/googleplay/android-developer/answer/10144311)

This checklist records preparation and remaining acceptance; it does not guarantee legal compliance or store approval.
