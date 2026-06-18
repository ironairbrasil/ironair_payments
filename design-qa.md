# Design QA

final result: blocked

Reference:
- `/Users/ayrtonborges/Downloads/ChatGPT Image 18 de jun. de 2026, 14_18_40.png`

Prototype route:
- `/checkout-ironair`

Blocking issue:
- The in-app Browser backend returned `Browser is not available: iab`, so I could not capture a rendered prototype screenshot through the required Product Design browser workflow.
- Local SSR also requires a valid Shopify app runtime/database. Without `DATABASE_URL` and the Shopify session table, the dev server cannot render routes normally.
- A local production server with dummy Shopify env vars still stops while checking the Prisma Shopify session table, so route-level HTTP verification could not complete locally.

Completed checks:
- The route and CSS compile with `npx react-router build` when provided minimal build-time env vars.
- `npm run lint` passed.
- `npm run typecheck` passed.

Visual implementation notes:
- Desktop layout follows the supplied Shopify-style mockup: two-column checkout, compact continuous delivery form, right order summary, top logo/security text, breadcrumb, black CTA, payment card, trust benefits, and bottom guarantee bar.
- Cart item parsing now supports `items[0][variantId]`, `items[0][quantity]`, `items[0][title]`, `items[0][price]`, `items[0][image]`, and `items[0][variantTitle]`.
- Product images are normalized from `//cdn.shopify.com/...` and relative Shopify paths before rendering.
- Cart totals are blocked when item data is incomplete or the total would be zero.
- Mobile collapses to one column.
