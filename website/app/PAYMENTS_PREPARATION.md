# Payment links and automatic WhatsApp — preparation only

Operator decision, 13 October 2026: prepare payment integration but leave it inactive; use automatic WhatsApp Business, not a manual WhatsApp compose button. No money movement, message send, merchant registration or paid resource activation is authorized by this preparation.

## Implemented

- Farm details: pool depth, bedrooms, bathrooms, optional validated map coordinates, rules, cancellation policy and an honest administration-review badge. The badge is manually set after actual review; it is not proof of a field visit.
- Dated morning/evening offers, an offers filter and a server-calculated booking amount. Offer dates refer to the date of the visit. Existing bookings retain their saved amount.
- Per-booking WhatsApp consent, unchecked by default and separate from marketing consent. Verified account ownership remains enforced. No phone number is copied into the payment outbox.
- Merchant adapter contract, persisted payment states, immutable server amount, one provider initialization per booking, authenticated administration setup status and a disabled link-generation endpoint. Checkout links accept HTTPS only on the installed provider's fixed origin allowlist.
- Payment webhook entry point rejects requests while inactive. An installed merchant adapter MUST verify event authentication and query provider status before returning a `VerifiedPayment`. Matching order, provider reference, amount and IQD currency are required. Client return URLs and uploaded receipts never mark an order paid.
- Automatic WhatsApp outbox sender uses an approved Twilio WhatsApp template. Template variables: 1 = booking ID, 2 = amount in IQD, 3 = checkout URL. Submission is atomic; concurrent workers do not submit the same row twice. A timeout becomes `unknown` and is not blindly retried. `accepted` means Twilio accepted the request, not delivered/read by the customer.
- Cancellation, expiry and account erasure stop queued messages and hide unpaid links. A payment arriving after cancellation is flagged `review_required`; it does not resurrect a booking or issue an automatic refund. Already accepted messages cannot be recalled; provider-side payment-link cancellation/expiry must be supported before launch.

## Intentionally pending

13 October update: the operator selected Wayl using the existing Safi merchant account. `src/lib/wayl.server.ts` now implements the official Wayl API contract. After explicit approval, an additional dedicated Mazraaty API token was created on that same account and verified with HTTP 200 from `GET /api/v1/verify-auth-key`. It is saved only in ignored local configuration and preview Worker secrets. Safi's original token and settings were not changed. A separate random Mazraaty webhook secret is used; neither value is committed or sent to the browser.

Wayl references use `mazraaty-test-<payment UUID>` / `mazraaty-live-<payment UUID>`; they cannot consume Safi's `wix-*` references. Checkout uses the immutable saved IQD amount, a one-hour hosted link, authenticated API lookup before creation and after an ambiguous create response, separate derived webhook secrets and signed metadata. Raw-body HMAC authentication precedes independent status/amount/reference/metadata inquiry. Redirects never mark payments paid. Pending provider events are acknowledged without changing payment status. Returned/refund states require operator review; automatic refunds are not implemented.

Preview uses `WAYL_ENV=test`, `PAYMENTS_MODE=disabled` and `WAYL_LIVE_APPROVED=false`. No link was created and no payment was collected in the account connection check. Unit tests use fake API responses; actual sandbox checkout and authenticated callback acceptance still need testing before activation. A sandbox adapter cannot activate charging even if `PAYMENTS_MODE=live` is set. Live adapter installation additionally requires production and explicit `WAYL_LIVE_APPROVED=true` after the remaining launch checks.

No production WhatsApp sender or template is registered here. The pipeline runs only on a production environment with real phone verification, a merchant adapter, `PAYMENTS_MODE=live`, `WHATSAPP_ENABLED=true`, and privately configured Twilio sender/template credentials. Preview cannot send payment messages even if these activation variables are set accidentally.

The automatic path is: customer submits request → administration confirms/reserves a free slot → payment initialization uses the saved booking amount → approved template sends the hosted checkout link → authenticated, independently verified provider event records payment status. Until activation, confirmation reserves the visit and does not collect money. The final deposit/hold-expiry/cancellation rules need an operator decision before paid launch.

## Activation steps

1. Use the selected Wayl merchant account, preferably with a dedicated Mazraaty API token. Verify merchant approval for the Mazraaty business/domain. Do not collect card numbers in Mazraaty.
2. Exercise the implemented Wayl adapter against the provider sandbox, including authenticated callbacks at `/api/v2/payments/webhook?order=<payment UUID>` in a separately controlled sandbox harness. The preview customer payment endpoint remains disabled. Keep the separate webhook secret private; never reuse Safi callback URLs or keys. Do not set live approval until the sandbox and operational checks below pass.
3. Test payment success/failure, duplicate/reordered callbacks, timeout, expired link, cancellation before/after payment and account erasure in the provider sandbox. Implement hosted-link cancellation so accepted WhatsApp messages cannot cause stale charges.
4. Register an approved WhatsApp Business sender with Twilio/Meta, collect opt-in, and obtain an approved utility template using the variable contract above. Establish delivery callbacks with authenticated Twilio signatures before claiming delivered status. Unknown sends require provider reconciliation before retry.
5. Decide full payment versus deposit, unpaid reservation expiry, refund amounts/deadlines and responsibility. The current preparation does not invent these terms. Payment confirmation does not bypass slot conflicts or re-open a cancelled booking.
6. Update policies for the actual provider/Meta processing and retention, finish production SMS and account configuration, and obtain operator approval before activating paid integrations.
7. Keep preview and launch D1/R2 separate. Apply additive migrations only to the intended new environment; never copy customer/test records or overwrite existing production data for tests.

Private configuration names (placeholders only): `PAYMENTS_PROVIDER=wayl`, `WAYL_ENV=test`, `WAYL_LIVE_APPROVED=false`, `WAYL_API_TOKEN`, `WAYL_WEBHOOK_SECRET`, `PAYMENT_SITE_URL`, `PAYMENTS_MODE`, `WHATSAPP_ENABLED`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_TEMPLATE_SID`. Tokens and webhook secrets belong in Worker secrets, never public vars or GitHub. The sender must belong to the configured Twilio account; the template must be approved for the actual checkout domain. Test and production use distinct references/secrets; only the two configured Mazraaty Worker origins are accepted until a custom domain is reviewed.

## Official references

- https://wayl.io/docs and https://api.thewayl.com/openapi.v1.json — link creation, reference lookup, expiry, raw-body HMAC and merchant authentication.
- https://www.twilio.com/docs/messaging/api/message-resource — Messages API, channel addresses, ContentSid/ContentVariables and validity period.
- https://www.twilio.com/docs/whatsapp/key-concepts — WhatsApp customer-service windows and approved templates.

Validation: `bun run test:product`, `bun run typecheck`, `bun run build`, `bun run test:worker`. Tests use an in-memory database and fake merchant/provider responses; they are not a successful live payment or WhatsApp delivery test.
