# Feros Group — Strategic Review (v2)

A React rebuild of the Feros strategic-review POC, running on the Oolio One data in
Snowflake instead of per-venue CSV extracts.

| | Original POC | This build |
|---|---|---|
| Venues | 3 (HIG, OBH, PRI) | **11** |
| Revenue centres | ~10 | **44** |
| Period | Feb–Apr 2026 | **Jan–Jul 2026** (7 months) |
| Transactions | ~304,000 | **1,813,956** |
| Revenue | — | **$51,788,112** |
| Identified members | phone/loyalty mix | **102,779** (67.7% of TX) |
| Delivery | 10 MB single HTML, regenerated per run | React SPA, 120 KB data payload |

Measure definitions are carried across unchanged. Where the underlying data forced a
change, it is stated in the app's Methodology tab and in [Divergences](#divergences).

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
```

## Deploy it

```bash
npx vercel --prod
```

Vercel auto-detects Vite; no configuration is needed. A project named
`feros-strategic-review` already exists in the **Pixie Dust Industries** team, so
`vercel link` will offer it. Alternatively push this folder to a Git repo and import it
in the Vercel dashboard.

---

## What's in it

**Benchmark** — the foundation. Every venue × revenue centre, with a Total / Members /
Non-members cohort toggle and five column bands: revenue breakdown, tendered payments,
volume, average spend, ratios. Venue rows expand into their revenue centres.

**Member analysis** — member economics against non-members, frequency cohorts
(1 / 2–3 / 4–10 / 11+ visits), monthly flow with new / returning / lapsed, the January
cohort tracked forward, and cross-venue overlap including the pairwise venue matrix.

**Promotions & discounts** — five auto-classified discount categories expandable to tag
level, with a deduplicated total, effective-discount rates, a category trend across the
window, and a deep dive on each of the top three promotions.

**Trading patterns** — daypart cards with the within-tile food/bev mix, day-of-week
revenue against ATV and $/visit, a **day × hour revenue heatmap** on a 4am trade-day
boundary, and visit-level daypart crossover.

**What-if** — price rise, menu rounding, service fee, cash discount and rounding, MSF
terms and surcharge treatment, Oolio terminal and SaaS subsidies, and three behavioural
levers. Benchmark vs modelled deltas on eight metrics, a merchant P&L, an uplift
attribution strip, and a live product price list.

**Methodology** — definitions, provenance, reconciliation invariants, and divergences.

---

## Architecture

```
src/
  lib.ts               types, formatting, the Bench cube index, dataset decoder
  App.tsx              shell, tabs, month / venue filters
  components/ui.tsx    Card, Section, Kpi, Seg, Note
  tabs/                Benchmark, Members, Promotions, Trading, WhatIf, Methodology
public/
  dataset.bin          gzipped, string-pooled, columnar aggregate cube (120 KB)
etl/
  queries.sql          every Snowflake query behind the cube, with rationale
  pack_dataset.py      JSON -> string-pooled columnar -> gzip
```

The app is a pure client. All aggregation happens in Snowflake; the browser receives a
pre-computed cube and only ever sums, filters and formats. Nothing is recomputed from
transaction-level data at runtime, which is why 1.8 million transactions render instantly.

### The dataset payload

`dataset.bin` is ~900 KB of JSON reduced to 120 KB on the wire:

1. Every repeated label (venue, revenue centre, month, product, discount tag) is interned
   into a string pool and referenced by index.
2. Each table becomes an array of numeric rows plus a schema naming its columns.
3. The whole thing is gzipped and decompressed in the browser with `DecompressionStream`.

Hourly totals are not shipped at all — they are the heatmap summed over days, which is
identical regardless of the 4am attribution rule, so the app derives them on load.

### Rebuilding the data

Run the queries in `etl/queries.sql` against Snowflake, land each result as JSON, then:

```bash
python3 etl/build_dataset.py   # merge into public/dataset.json
python3 etl/pack_dataset.py    # pack + gzip into public/dataset.bin
```

---

## Methodology

Carried unchanged from the original review:

- **Transaction** — one completed order. Line items aggregate to the order; lines are
  never counted as transactions.
- **Visit** — one person, one venue, one calendar day. Seven transactions across lunch and
  dinner at one venue is *one visit*. Chosen over ±4hr clustering because it is
  unambiguous and survives cross-page reconciliation.
- **Person** — one unique identity across the selected period, so `$ / person` is value
  over the window rather than per day.
- **Revenue** — order total, post-discount, inclusive of tax. Food/beverage split from
  item-level product type.
- **Items** — sellable quantity only. Condiments, modifiers, "add" lines and zero-price
  rows are excluded by the same classifier the POC used: 19% of all lines, 1% of revenue.
- **Dayparts** — Lunch < 15:00, Happy 15:00–17:59, Dinner ≥ 18:00, binned on the order's
  opening hour, so a transaction spanning 14:55 → 15:10 is Lunch.
- **Trading heatmap** — `trade_dow = dayname(ts - 4 hours)` with a clock-time hour axis.
  A transaction rung at 1am Tuesday belongs to Monday's row at hour 1. This rule applies
  to the heatmap *only*; every other view uses calendar-day attribution.
- **Discounts** — five categories (Promotion / Member / Voucher / Staff / Manual). A
  transaction touched by two categories is counted in both, so category rows over-count;
  the total row is deduplicated. `$ given` is exact at every level.

### Divergences

**Person identity is two-tier here, not three.** The POC resolved Member → Card-IDed
(masked PAN + cardholder first name) → Unidentified. The Oolio One payment tables carry
no masked card number or cardholder name, so the middle tier cannot be reconstructed.
This build uses Member and Unidentified, where each unidentified transaction counts as one
person. The effect is confined to the non-member cohort: its person count is an upper
bound, and its `$ / person` and `visits / person` are correspondingly conservative. Member
figures — which carry the analysis — are unaffected, and at 67.7% loyalty coverage the
identified population is far larger than the original review had available.

**Tendered payments exceed menu revenue** by roughly 12%. Cash over-tender is not written
back as a negative tender line and on-account settles in a different period from the sale.
The payment columns are a channel-mix view, not a second revenue total.

**Revenue-centre visits over-count at venue rollup.** A guest transacting in two revenue
centres on one day is one visit in each. Venue rows are the source of truth. The same
applies to daypart visits, which is why the daypart Total tile uses the deduplicated
crossover figure rather than the sum of the three bands.

**Merchant billing is not in Snowflake.** The What-If page's MSF rate, terminal and SaaS
costs are inputs you set, defaulted to plausible values (MSF 1.36% — the blended rate used
in the original review). Set them against the real contract before quoting any figure.

### Reconciliation invariants

All held at build time on the Jan–Jul 2026 window:

| Invariant | Value |
|---|---|
| Member TX + non-member TX = group total | 1,813,956 |
| Food + bev + other = menu revenue | $51,788,112 |
| Daypart TX summed = group total | 1,813,956 |
| Heatmap cells summed (4am boundary) = linear totals | 1,813,956 |
| Crossover patterns summed = group TX and revenue | 1,813,956 / $51,788,112 |
| Frequency cohorts summed = member totals | 102,779 / 1,227,612 TX |

---

## Source

`OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC` — organisation `01KYKN7DW3KYYV1B6K539CB5F2`
("Feros_ho"), `ORDER_STATUS = 'COMPLETED'`, `2026-01-01` to `2026-07-31`.

Venues: Berry Hotel, Engadine Tavern, Heathcote Hotel, Helm Bar, Highfield Caringbah,
Ocean Beach Hotel, Parc Pavilion, Potts Point Shop, Prince Kirrawee, Taren Point Hotel,
The Wilton.
