# Customer design direction — October 2026

The customer site is a calm Iraqi hospitality catalogue: forest green, warm
ivory, restrained antique gold, the existing palm-gate logo, and locally hosted
Noto Arabic type. The current Explore, Favorites and Bookings screens are the
reference for navigation and functionality; their layered glass styling is
replaced with one customer-only theme. Administration keeps its existing UI.

- Primary action: discover a farm, inspect real details, choose a period/date.
- Desktop: compact masthead navigation, split photographic introduction, search
  before all results, three-column farm catalogue.
- Phone: compact introduction only in Explore, two-row search controls, single
  column cards, persistent bottom navigation respecting device safe areas.
- Favorites and Bookings start with a page title and their own content.
- Photo, name, location and actual price take priority. No invented ratings,
  availability, booking counts, verification badges or destination imagery.
- Glass is reserved for the mobile navigation. Content and dialogs use opaque
  surfaces for readability and to avoid nested backdrop-filter paint failures.
- Search, empty results, loading, errors, favorite selection, booking statuses,
  phone sign-in and native dialog focus behavior remain available.
- Preserve server authorization, Baghdad dates, separate morning/evening slots,
  the 8% confirmation fee with the remaining amount shown, and test-only payment.
- Verify at 320, 390, 768, 1024 and 1440px; check long names/prices, keyboard focus,
  reduced motion and dialogs. Use disposable local data for visual checks.

No launch or security readiness is implied by this visual redesign. The current
dependency findings in LAUNCH_TASKS.md task 16 remain a separate release gate.

## Verification — 25 October 2026

- Typecheck, UI contract and final production build passed.
- Product tests: 28 passed, 0 failed, 519 assertions.
- Chrome checked at 320, 390, 768, 1024 and 1440px without horizontal page overflow.
- Local disposable fixtures exercised long names and prices, search/filter reset,
  persisted favorites, separate tab headings, native dialog Escape/focus,
  demo sign-in, an evening booking and the 8% / 92% quote. No real SMS or payment.
- Tab changes return to the top; the introduction only exists in Explore.
- No application console errors observed; one unrelated browser-extension warning.
- No online deployment: the existing dependency audit findings remain unresolved.
