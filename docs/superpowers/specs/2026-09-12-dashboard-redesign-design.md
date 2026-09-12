# Dashboard redesign: product face + categorization tools

Date: 2026-09-12. Piece 1 of 3 (2: conversational Telegram bot, 3: splits).

## Goal

Make qolar.app feel like a real fintech product: Copilot-Money-style dark UI
with a light toggle, a proper chart set on the overview, and categorization
that takes seconds (review inbox, bulk select, apply-to-merchant prompt).

Out of scope: splits, Telegram changes, mobile app, billing, category colour
picker, custom date ranges.

## 1. Layout and theme

- **Sidebar shell** replaces the top nav. Items: Overview, Transactions,
  Review (badge = count of transactions that are uncategorized, ambiguous, or
  have an open nudge), Categories & rules, Accounts (current `/connect`
  page, renamed). Sidebar is 240px on `md+`; on smaller screens it becomes a
  fixed bottom tab bar with icons. Clerk `UserButton` sits at the bottom of
  the sidebar with the theme toggle.
- **Theme**: `next-themes` with `attribute="class"`, `defaultTheme="dark"`,
  toggle in the sidebar. Theme is persisted by `next-themes` (localStorage)
  and applied before paint via its inline script, so no flash.
- **Palette** (dark): canvas `oklch(0.13 0.005 260)`, card `oklch(0.17 …)`,
  border `oklch(0.24 …)`, foreground `oklch(0.95 …)`, muted text
  `oklch(0.65 …)`, accent (primary) a blue-violet `oklch(0.72 0.15 275)`.
  Light theme mirrors it with the existing shadcn light tokens, adjusted so
  the accent is the same hue. Both defined in `globals.css` as CSS
  variables; components never hardcode colours.
- **Category colours**: a fixed 12-entry palette (`lib/category-color.ts`),
  chosen for contrast on both themes. Index = API-provided `color_index`
  (see §4). The same colour is used everywhere a category appears: donut
  slice, list dot, chip, table dot, badge. "Uncategorized" is always the
  muted grey; "Transfers" is always the neutral slate.
- **Type**: Geist for text, `tabular-nums` on every amount. Stat numbers
  `text-3xl font-semibold`. Income amounts green (`--income`), spend uses the
  foreground colour, never red (red is reserved for errors).

## 2. Overview page

All numbers derive from the already-fetched full transaction list, filtered
by the month and account controls (kept as URL params as today). "Last
month" comparisons use the calendar month before the selected one. Transfers
are excluded from spend and income everywhere.

- **Stat row** (4 cards): Spent, Income, Net, Unsorted. Each card shows a
  small delta vs. last month (`+12%` in muted text; for Unsorted the delta is
  omitted and the card links to `/review`).
- **Spend trend** (`components/charts/trend-chart.tsx`): last 6 months
  ending at the selected month. Grouped bars per month: spend (accent) and
  income (green, thinner). Selected month slightly brighter, others dimmed.
  Clicking a bar sets `?month=`.
- **Category donut** (`components/charts/category-donut.tsx`): Recharts
  `PieChart` with `innerRadius`, total spend in the centre. Beside it, a
  category list: colour dot, name, amount, share %, delta vs. last month.
  Hovering a row highlights the slice; clicking either navigates to
  `/transactions?month=…&category=…`.
- **Cumulative spend** (`components/charts/cumulative-chart.tsx`): line of
  running spend by day for the selected month; last month as a dashed muted
  ghost line. X axis is day-of-month 1–31. Tooltip shows both values.
- **Top merchants**: 5 rows, merchant name, count, amount, category dot.
  Merchant grouping uses the same normalization as the API's `merchant_key`
  (trim, collapse whitespace, lowercase).
- **Recent**: last 8 transactions using the new table (§3).
- Empty state (no accounts) stays as today, restyled.

Grid: stat row full width; then a 2-column row (trend 7/12, donut 5/12); then
a 2-column row (cumulative 7/12, top merchants 5/12); then Recent. Single
column under `lg`.

## 3. Categorization tools

### 3a. Review inbox (`/review`)

Server component fetches transactions + categories, filters to "needs
attention" (uncategorized OR `is_ambiguous` OR `nudge_pending`), sorted
newest first, and hands the list to a client `ReviewDeck`.

- One card at a time: merchant (large), description if different, amount,
  date, account, bank category (`plaid_category`, humanized), and the
  current guess if any.
- Below: category chips. Order = categories sorted by the user's transaction
  count desc, then name. Chips show their colour dot. Keys `1`–`9` pick the
  first nine chips; `T` picks Transfers; `S` skips; `←` goes back one card;
  `/` focuses a search-within-categories input.
- Picking a chip calls `PUT /plaid/transactions/{id}/category` with
  `{category, apply_to_merchant: false}`, optimistically advances, and shows
  the apply-to-merchant toast (§3c) when siblings exist.
- Progress "3 of 12" in the header; done state with a check mark and a link
  back to Overview. Skipped cards are not re-shown in the same session.
- Sidebar badge count updates on `router.refresh()` after each pick.

### 3b. Bulk select (Transactions page)

- Checkbox column on the transactions table, header checkbox selects all
  visible rows. Selection is client state in `TransactionsTable`.
- When ≥1 selected, a floating bar at the bottom: "3 selected · Set
  category [picker] · Clear". Picker is the existing category select styled
  as a chip menu.
- Applying calls `POST /plaid/transactions/bulk-category` (§4), then
  `router.refresh()`. No apply-to-merchant prompt for bulk (the user chose
  the rows explicitly).

### 3c. Apply-to-merchant prompt

- Changing one transaction's category (table picker or review chip) sends
  `apply_to_merchant: false`. The API response includes
  `merchant_siblings`: the number of other transactions from the same
  merchant key **not** set by the user (`category_source != 'user'`).
- If `merchant_siblings > 0`, show a toast (shadcn `sonner`): "Apply
  *Coffee* to 13 other Tim Hortons? **Yes** · Just this one". Yes re-sends
  the same PUT with `apply_to_merchant: true`. Toast auto-dismisses in 8s
  (= "just this one").
- Behaviour change: a single edit no longer writes a merchant override.
  Only "Yes" does. Telegram nudge replies still learn automatically
  (`nudge.py` unchanged).

### 3d. Table restyle

`TransactionsTable` gets: category shown as a coloured chip that opens the
picker on click (instead of a bare `<select>`), merchant with a generated
initial avatar (2 letters, category colour at 20% opacity), pending badge,
"asked on Telegram" badge, income in green with `+`. Row hover reveals the
checkbox on desktop; always visible on mobile.

## 4. API changes (`api/`)

- `PUT /plaid/transactions/{id}/category` body becomes
  `{category: str, apply_to_merchant: bool = false}`.
  - Always: set the transaction (`category_source='user'`,
    `is_ambiguous=false`, resolve open nudge).
  - If `apply_to_merchant`: `learn_override(source='user')` and update every
    other transaction of this user with the same `merchant_key` whose
    `category_source != 'user'` to the same category with
    `category_source='learned'`.
  - Response: existing serialized transaction plus `merchant_siblings`
    (count of same-merchant transactions with `category_source != 'user'`,
    computed **before** applying) and `applied` (count changed, 0 when not
    applying).
- `POST /plaid/transactions/bulk-category` body
  `{transaction_ids: [uuid], category: str}`. Sets each owned transaction
  as a user edit (same rules as the single PUT, no override). Ignores ids
  not owned by the user. Response `{updated: int}`. Max 500 ids.
- `GET /categories` adds `color_index: int` per category: stable hash of
  the lowercase name mod 12 (`zlib.crc32`). Special cases: "Uncategorized"
  and "Transfers" are handled client-side by name.
- `plaid.py` reuses `merchant_key` from `categorize.py` for sibling matching.

No migration.

## 5. Web data plumbing

- `lib/api.ts`: `Category` gains `color_index`; `setCategory(id, name,
  applyToMerchant)` and `bulkSetCategory(ids, name)` helpers on the client
  side go through `/api/proxy` (allowlist gains
  `plaid/transactions/bulk-category`).
- `lib/stats.ts` (new, pure functions, unit-tested with Vitest): `monthly
  totals`, `byCategory`, `cumulativeByDay`, `topMerchants`, `delta`. The
  overview and review pages compose these; no maths inline in components.
- `lib/category-color.ts`: palette + `categoryColor(name, index)`.

## 6. Testing

- **API**: introduce `api/tests/` with pytest + httpx `TestClient`. Fixture
  creates a throwaway schema on the local Postgres (`DATABASE_URL` from
  `.env`, database `loonie_test`, created if missing, `Base.metadata.
  create_all`), overrides `current_user` with a fixture user. Tests: single
  PUT sets and does not write an override; PUT with `apply_to_merchant`
  writes the override and relabels siblings but not user-set ones;
  `merchant_siblings` count; bulk sets only owned ids; `color_index` is
  stable.
- **Web**: Vitest for `lib/stats.ts` and `lib/category-color.ts`. `npm run
  build` must pass. Manual pass on real data: every page, both themes,
  375px and 1440px widths.
- **Rollout**: deploy API first (backward compatible: the flag defaults to
  false, which is the *new* behaviour, so deploy web in the same session),
  then web.

## 7. Files

New: `web/components/shell/{sidebar,mobile-tabs,theme-toggle}.tsx`,
`web/components/charts/{trend-chart,category-donut,cumulative-chart}.tsx`,
`web/components/{stat-card,merchant-avatar,category-chip,top-merchants}.tsx`,
`web/components/review/review-deck.tsx`, `web/app/review/page.tsx`,
`web/lib/{stats,category-color}.ts`, `web/lib/__tests__/stats.test.ts`,
`api/tests/{conftest,test_categorize_endpoints}.py`.

Changed: `web/app/{layout,page,globals.css}`, `web/app/transactions/page.tsx`,
`web/app/connect/page.tsx` (title "Accounts"), `web/components/
{transactions-table,category-picker,nav→removed,filters}.tsx`,
`web/lib/api.ts`, `web/app/api/proxy/[...path]/route.ts`,
`api/app/routers/plaid.py`, `api/app/routers/categories.py`,
`api/requirements.txt` (pytest), `docs/architecture.md`.

Dependencies added: `next-themes`, `sonner`, `vitest` (web); `pytest` (api).
