# Working on Mazraaty

Read README.md and SETUP.md before editing. The live, independent product is under website/app. ios-legacy is real source but an older Wix-based prototype, not the current mobile implementation.

Preserve morning/evening independent slots, Baghdad date semantics, legacy full-day blocking, server ownership checks, verified phone accounts, private admin access, and no live payments. Do not claim iOS works without compiling/testing it on a Mac.

Never commit actual environment variables, admin passwords, Twilio tokens, signing keys/certificates, customer databases, or private screenshots. Use placeholder configuration only. Keep migrations additive and avoid modifying production data for tests.

For authorized edits to the running Higgsfield site, follow its existing cloud checkout/push/deploy workflow. GitHub push alone is backup/source synchronization, not a production deploy. Local edits to this clone do not authorize publication or a new hosting project.

Validate website changes with typecheck, build and the product tests listed in SETUP.md. The original scaffold's landing-contract test still expects an unused ScrollScrub home and has a documented existing failure; do not restore that home to silence it.
