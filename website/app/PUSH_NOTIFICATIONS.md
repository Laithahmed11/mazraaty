# Android push notifications

Booking storage stays in Cloudflare D1 and photos in R2. Firebase is used only
to deliver notifications to the two native Android wrappers. iOS is not implemented.

## Configure privately

1. Register Android packages `com.mazraaty.customer` and `com.mazraaty.owner` in
   your Firebase project. Save each app's downloaded `google-services.json` in
   its matching `android/customer/` or `android/owner/` folder. These files are ignored.
2. For CI, save their complete JSON as repository secrets `FIREBASE_CUSTOMER_JSON`
   and `FIREBASE_OWNER_JSON`. Never commit app configuration or server credentials.
3. Create a dedicated Google service account with **Firebase Cloud Messaging API
   Admin** on this project. Avoid granting Owner/Editor or using an unrelated account.
   Keep the downloaded PKCS8 private key in an ignored local file and put its values
   into Cloudflare secrets `FCM_CLIENT_EMAIL` and `FCM_PRIVATE_KEY` on the preview
   Worker only. Set `FCM_PROJECT_ID` and `PUSH_ENABLED=true` in its private Wrangler
   config. Do not put the service-account JSON in an APK or a GitHub artifact.
4. Apply additive D1 migrations to the preview DB, build the preview site, deploy
   the preview Worker, and rebuild both Android apps with JDK 17, Gradle 8.11.1
   and Android SDK 35. The scripts/CI verify the resulting signed debug APKs.
5. Install on a physical Android device with Google Play services. Sign in and
   explicitly enable notifications; on Android 13+ accept the OS permission.
   Check new booking, confirmation, rejection, cancellation, reminder and logout
   in both foreground and background. These delivery checks require a real phone.

Without app configuration the APK builds, but the UI reports that Firebase is
not configured. Without Worker credentials, registration and offer sending stay
disabled. A successful compile or mocked FCM test is not proof of phone delivery.

## Behavior and limits

- An exact-origin, main-frame AndroidX WebMessage listener registers the FCM token
  using the authenticated web session. Customer devices are tied to the server's
  account booking identity; owner devices require a current private admin session.
- There are no public topics or broadcasts containing customer data. Booking
  notifications use generic text and an ID; the destination opens bookings and
  requires authentication. Names, phones, notes and prices are not sent to FCM.
- Session deletion/account erasure disables server delivery. Native logout also
  clears the binding and existing notifications. Expired sessions and rotated
  admin credentials are excluded. Admin push sessions currently last eight hours;
  reopen/sign in again to renew the binding. Customer sessions last thirty days.
- Booking events are recorded by additive SQL triggers in the same transaction
  as the write. Replayed requests/status updates do not create duplicate events.
  Delivery retries use a lease/backoff, up to five attempts. FCM's accepted response
  is not proof of device delivery; rare duplicate delivery is possible on timeout.
- A scheduled dispatch runs every minute; successful mutations also request a
  background dispatch. It reminds confirmed bookings within three hours of the
  **Baghdad start time** (07:00 morning / 19:00 evening), never the evening end date.
- New events are not replayed to later device registrations. Events expire after
  one day; invalid FCM tokens are removed. Token rotation is synchronized when
  the app returns to the foreground; closed apps may need reopening after rotation.
- Marketing consent is separate and defaults to off. The owner form queues a
  title/body (80/300 chars) to currently opted-in customer devices, with a maximum
  of five campaigns per day. Turning offers off cancels pending offer deliveries.
  Users can keep booking notifications while disabling offers, or disable all push.
- Firebase collection is initialized only after enabling push; Analytics and
  messaging auto-init are disabled by default. No live SMS or payments are involved.
- Debug APK signing is for testing only. Use a persistent private release signing
  key and a production Firebase/Worker configuration before store publication.

## Validation

`bun run typecheck`, `bun run test:product`, `bun run build`, `bun run test:worker`.
The push product test uses an empty migrated SQLite database and mocked OAuth/FCM;
it checks JWT signatures, ownership, consent, outbox replay, retry and logout.
Android workflows compile Firebase dependencies and verify signed APKs. Physical
device delivery, OS permission denial and tapping/background behavior remain
mandatory acceptance checks before claiming push notifications work for users.
