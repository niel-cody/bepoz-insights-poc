-- ============================================================================
-- Feros Group Strategic Review — Snowflake extraction
--
-- Source : OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC  (Oolio One platform tables)
-- Org    : 01KYKN7DW3KYYV1B6K539CB5F2  ("Feros_ho")
-- Window : 2026-01-01 .. 2026-07-31  (7 complete months)
-- Scope  : 11 venues, 44 revenue centres (stores), 1,813,956 completed orders,
--          $51,788,112 menu revenue, 102,779 loyalty members.
--
-- Every query below produced one JSON blob that was folded into public/dataset.bin.
-- Measure definitions are carried unchanged from the original Feros POC
-- (member-bistro-pub-venues skill); see METHODOLOGY in the README.
--
-- Shared conventions
--   TX        = one ORDER_ID with ORDER_STATUS = 'COMPLETED'
--   person_id = CUSTOMER_ID when present, else 'U:'||ORDER_ID (one TX = one person)
--   visit     = distinct (person_id, venue, calendar date)
--   revenue   = ORDERS.TOTAL_PRICE (post-discount, inclusive of tax)
--   '*'       = rollup member of a GROUPING SETS cube
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Scope discovery — how the org, window and grain were chosen
-- ---------------------------------------------------------------------------
SELECT ORGANIZATION_ID, ANY_VALUE(ORGANIZATION_NAME) org, COUNT(*) orders,
       COUNT(DISTINCT VENUE_ID) venues, COUNT(DISTINCT STORE_ID) stores,
       ROUND(SUM(TOTAL_PRICE)) rev, MIN(CREATED_AT_TZ)::DATE mn, MAX(CREATED_AT_TZ)::DATE mx,
       COUNT(DISTINCT CUSTOMER_ID) custs
FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
WHERE ORDER_STATUS = 'COMPLETED' AND CREATED_AT_TZ >= '2023-01-01' AND IS_TRAINING = FALSE
GROUP BY 1 ORDER BY rev DESC LIMIT 30;


-- ---------------------------------------------------------------------------
-- 1. COHORT — the Benchmark cube (venue x revenue centre x month x segment)
--    Person and visit counts do not roll up additively across venues or months,
--    so every rollup level is materialised explicitly via GROUPING SETS.
--    Member and non-member person sets ARE disjoint, so 'all' = member + non-member.
-- ---------------------------------------------------------------------------
WITH o AS (
  SELECT ORDER_ID, VENUE_NAME AS venue, STORE_NAME AS rc,
         TO_CHAR(DATE_TRUNC('month', CREATED_AT_TZ), 'YYYY-MM') AS mth,
         CREATED_AT_TZ::DATE AS d,
         IFF(CUSTOMER_ID IS NOT NULL AND CUSTOMER_ID <> '', 'member', 'nonmember') AS seg,
         COALESCE(NULLIF(CUSTOMER_ID, ''), 'U:' || ORDER_ID) AS pid,
         TOTAL_PRICE AS rev, TOTAL_DISCOUNT AS disc
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND ORDER_STATUS = 'COMPLETED'
    AND CREATED_AT_TZ >= '2026-01-01' AND CREATED_AT_TZ < '2026-08-01'
)
SELECT COALESCE(venue,'*') venue, COALESCE(rc,'*') rc, COALESCE(mth,'*') mth, seg,
       COUNT(*) tx, SUM(rev) rev, SUM(disc) disc,
       COUNT(DISTINCT pid) ppl, COUNT(DISTINCT pid || '|' || d) vis
FROM o
GROUP BY GROUPING SETS ((venue,rc,mth,seg),(venue,mth,seg),(mth,seg),(venue,rc,seg),(venue,seg),(seg));


-- ---------------------------------------------------------------------------
-- 2. ITEMS + FOOD/BEV — same cube, from the line-item table
--    The condiment classifier mirrors the POC rule set: a line is NOT a sellable
--    item if it is a zero-price line, an ingredient/fee product type, a name that
--    starts with an "add / swap / modifier" verb, or a name containing a
--    sauce/side/condiment token. 19% of lines, 1% of revenue.
-- ---------------------------------------------------------------------------
WITH o AS (
  SELECT ORDER_ID, VENUE_NAME AS venue, STORE_NAME AS rc,
         TO_CHAR(DATE_TRUNC('month', CREATED_AT_TZ), 'YYYY-MM') AS mth,
         IFF(CUSTOMER_ID IS NOT NULL AND CUSTOMER_ID <> '', 'member', 'nonmember') AS seg
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND ORDER_STATUS = 'COMPLETED'
    AND CREATED_AT_TZ >= '2026-01-01' AND CREATED_AT_TZ < '2026-08-01'
), it AS (
  SELECT i.ORDER_ID, i.PRODUCT_TYPE_NAME AS pt, i.QUANTITY AS q, i.TOTAL_PRICE AS amt,
    CASE WHEN i.PRODUCT_TYPE_NAME IN ('Other','Coffee And Tea Ingre','Uber Fee','') THEN 1
         WHEN COALESCE(i.TOTAL_PRICE,0) = 0 AND COALESCE(i.GROSS_PRICE,0) = 0 THEN 1
         WHEN REGEXP_LIKE(i.PRODUCT_NAME,'(Add|Swap|Modifier|Text|Note|Instruction|Request|Choose|Choice of|Without|No ).*','i') THEN 1
         WHEN REGEXP_LIKE(i.PRODUCT_NAME,'.*(Sauce|Aioli|Condiment|Butter|Side|Extra |Zero Price).*','i') THEN 1
         WHEN LOWER(TRIM(i.PRODUCT_NAME)) IN ('salt','lemon','lime','mustard','pepper','garlic','mayo','chips only') THEN 1
         ELSE 0 END AS cond
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDER_ITEMS i
  WHERE i.ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2'
), j AS (
  SELECT o.venue, o.rc, o.mth, o.seg, it.q, it.amt, it.cond,
    CASE WHEN it.pt IN ('Food Sales','Deli') THEN 'F'
         WHEN it.pt IN ('Beer','Wine','Spirits','Cocktails','Premix','Cider','Non Alcoholic','Coffee And Tea ') THEN 'B'
         ELSE 'O' END AS fb
  FROM it JOIN o USING (ORDER_ID)
)
SELECT COALESCE(venue,'*') venue, COALESCE(rc,'*') rc, COALESCE(mth,'*') mth, seg,
       ROUND(SUM(IFF(cond = 0, q, 0))) items,
       SUM(IFF(fb='F', amt, 0)) food, SUM(IFF(fb='B', amt, 0)) bev, SUM(IFF(fb='O', amt, 0)) oth
FROM j
GROUP BY GROUPING SETS ((venue,rc,mth,seg),(venue,mth,seg),(mth,seg),(venue,rc,seg),(venue,seg),(seg));


-- ---------------------------------------------------------------------------
-- 3. PAYMENT CHANNELS — same cube, from the tender table
--    Tendered value exceeds menu revenue (cash over-tender is not written back
--    as a negative tender line; on-account settles in a different period).
--    These columns are a channel-mix view, not a second revenue total.
-- ---------------------------------------------------------------------------
WITH o AS (
  SELECT ORDER_ID, VENUE_NAME AS venue, STORE_NAME AS rc,
         TO_CHAR(DATE_TRUNC('month', CREATED_AT_TZ), 'YYYY-MM') AS mth,
         IFF(CUSTOMER_ID IS NOT NULL AND CUSTOMER_ID <> '', 'member', 'nonmember') AS seg
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND ORDER_STATUS = 'COMPLETED'
    AND CREATED_AT_TZ >= '2026-01-01' AND CREATED_AT_TZ < '2026-08-01'
), p AS (
  SELECT ORDER_ID, AMOUNT amt, PAYMENT_SURCHARGE sur,
    CASE WHEN PAYMENT_TYPE_NAME IN ('EFTPOS','Online Payment','EXTPAYMENT','Uber Eats','Seven Rooms Deposit') THEN 'card'
         WHEN PAYMENT_TYPE_NAME = 'Cash' THEN 'cash'
         WHEN PAYMENT_TYPE_NAME IN ('GIFTCERT_REDEEM','GIFTCERT_SELL') THEN 'vouch'
         WHEN PAYMENT_TYPE_NAME IN ('Manager Meal','Manager Comp','Head Office Meal','Sponsorship','Promotion','Promotion ') THEN 'comp'
         WHEN PAYMENT_TYPE_NAME = 'ACCCHARGE' THEN 'acct'
         ELSE 'other' END ch
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDER_PAYMENTS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2'
), j AS (SELECT o.venue, o.rc, o.mth, o.seg, p.ch, p.amt, p.sur FROM p JOIN o USING (ORDER_ID))
SELECT COALESCE(venue,'*') venue, COALESCE(rc,'*') rc, COALESCE(mth,'*') mth, seg,
       SUM(IFF(ch='card',  amt, 0)) card, SUM(IFF(ch='cash',  amt, 0)) cash,
       SUM(IFF(ch='vouch', amt, 0)) vouch, SUM(IFF(ch='comp',  amt, 0)) comp,
       SUM(IFF(ch='acct',  amt, 0)) acct,  SUM(IFF(ch='other', amt, 0)) othp, SUM(sur) sur
FROM j
GROUP BY GROUPING SETS ((venue,rc,mth,seg),(venue,mth,seg),(mth,seg),(venue,rc,seg),(venue,seg),(seg));


-- ---------------------------------------------------------------------------
-- 4. TRADING — dayparts and day-of-week (calendar-day attribution)
--    Daypart bands: Lunch < 15:00, Happy 15:00-17:59, Dinner >= 18:00.
--    A TX is binned by its OPENING hour.
-- ---------------------------------------------------------------------------
WITH o AS (
  SELECT ORDER_ID, VENUE_NAME venue, TO_CHAR(DATE_TRUNC('month', CREATED_AT_TZ),'YYYY-MM') mth,
    CREATED_AT_TZ::DATE d, HOUR(CREATED_AT_TZ) hr,
    COALESCE(NULLIF(CUSTOMER_ID,''), 'U:' || ORDER_ID) pid, TOTAL_PRICE rev,
    CASE WHEN HOUR(CREATED_AT_TZ) < 15 THEN 'Lunch'
         WHEN HOUR(CREATED_AT_TZ) < 18 THEN 'Happy' ELSE 'Dinner' END dp,
    DAYOFWEEKISO(CREATED_AT_TZ) dow
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND ORDER_STATUS = 'COMPLETED'
    AND CREATED_AT_TZ >= '2026-01-01' AND CREATED_AT_TZ < '2026-08-01'
), ia AS (
  -- per-order sellable item count and food/bev split (same classifier as query 2)
  SELECT ORDER_ID,
    ROUND(SUM(IFF(CASE WHEN PRODUCT_TYPE_NAME IN ('Other','Coffee And Tea Ingre','Uber Fee','') THEN 1
         WHEN COALESCE(TOTAL_PRICE,0) = 0 AND COALESCE(GROSS_PRICE,0) = 0 THEN 1
         WHEN REGEXP_LIKE(PRODUCT_NAME,'(Add|Swap|Modifier|Text|Note|Instruction|Request|Choose|Choice of|Without|No ).*','i') THEN 1
         WHEN REGEXP_LIKE(PRODUCT_NAME,'.*(Sauce|Aioli|Condiment|Butter|Side|Extra |Zero Price).*','i') THEN 1
         ELSE 0 END = 0, QUANTITY, 0))) items,
    SUM(IFF(PRODUCT_TYPE_NAME IN ('Food Sales','Deli'), TOTAL_PRICE, 0)) food,
    SUM(IFF(PRODUCT_TYPE_NAME IN ('Beer','Wine','Spirits','Cocktails','Premix','Cider','Non Alcoholic','Coffee And Tea '), TOTAL_PRICE, 0)) bev
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDER_ITEMS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' GROUP BY 1
), j AS (
  SELECT o.*, COALESCE(ia.items,0) items, COALESCE(ia.food,0) food, COALESCE(ia.bev,0) bev
  FROM o LEFT JOIN ia USING (ORDER_ID)
)
-- dayparts
SELECT COALESCE(venue,'*') venue, COALESCE(mth,'*') mth, dp,
       COUNT(*) tx, SUM(rev) rev, COUNT(DISTINCT pid || '|' || d) vis,
       SUM(items) items, SUM(food) food, SUM(bev) bev
FROM j GROUP BY GROUPING SETS ((venue,mth,dp),(venue,dp),(mth,dp),(dp));
-- day of week: same CTE, GROUP BY GROUPING SETS ((venue,mth,dow),(venue,dow),(mth,dow),(dow))


-- ---------------------------------------------------------------------------
-- 5. TRADING HEATMAP — day x hour, with the 4am trade-day boundary
--    trade_dow = dayname(ts - 4 hours); the hour axis stays clock-time, so a TX
--    rung at 1am Tuesday lives in the MONDAY row at hour 1. This rule applies to
--    the heatmap ONLY — it redistributes late trade between adjacent days and
--    still reconciles to the same revenue and TX totals.
-- ---------------------------------------------------------------------------
WITH o AS (
  SELECT VENUE_NAME venue, TO_CHAR(DATE_TRUNC('month', CREATED_AT_TZ),'YYYY-MM') mth,
         DAYOFWEEKISO(DATEADD('hour', -4, CREATED_AT_TZ)) tdow,
         HOUR(CREATED_AT_TZ) hr, TOTAL_PRICE rev
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND ORDER_STATUS = 'COMPLETED'
    AND CREATED_AT_TZ >= '2026-01-01' AND CREATED_AT_TZ < '2026-08-01'
)
SELECT venue, mth, tdow, hr, COUNT(*) tx, ROUND(SUM(rev)) rev
FROM o GROUP BY 1,2,3,4;


-- ---------------------------------------------------------------------------
-- 6. MEMBER FREQUENCY COHORTS
--    Buckets are computed on DISTINCT VISIT DAYS within the selected scope, so
--    they recompute per venue and per month rather than being a fixed label.
-- ---------------------------------------------------------------------------
WITH o AS (
  SELECT ORDER_ID, VENUE_NAME venue, TO_CHAR(DATE_TRUNC('month', CREATED_AT_TZ),'YYYY-MM') mth,
         CREATED_AT_TZ::DATE d, CUSTOMER_ID pid, TOTAL_PRICE rev
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND ORDER_STATUS = 'COMPLETED'
    AND CREATED_AT_TZ >= '2026-01-01' AND CREATED_AT_TZ < '2026-08-01'
    AND CUSTOMER_ID IS NOT NULL AND CUSTOMER_ID <> ''
), s AS (
  SELECT COALESCE(venue,'*') venue, COALESCE(mth,'*') mth, pid,
         COUNT(DISTINCT d) vis, COUNT(*) tx, SUM(rev) rev
  FROM o GROUP BY GROUPING SETS ((venue,mth,pid),(venue,pid),(mth,pid),(pid))
), b AS (
  SELECT venue, mth, pid, vis, tx, rev,
         CASE WHEN vis = 1 THEN '1' WHEN vis <= 3 THEN '2-3'
              WHEN vis <= 10 THEN '4-10' ELSE '11+' END ck
  FROM s
)
SELECT venue, mth, ck, COUNT(*) persons, SUM(vis) visits, SUM(tx) tx, ROUND(SUM(rev),2) revenue
FROM b GROUP BY 1,2,3;


-- ---------------------------------------------------------------------------
-- 7. MONTHLY FLOW, RETENTION, CROSS-VENUE OVERLAP
--    new       = first month this member appears at this venue in the window
--    returning = also present in the immediately prior month
--    retention = the JANUARY cohort tracked forward (fixed base, not rolling)
--    pairs     = members shared between each pair of venues over the whole window
-- ---------------------------------------------------------------------------
WITH o AS (
  SELECT VENUE_NAME venue, TO_CHAR(DATE_TRUNC('month', CREATED_AT_TZ),'YYYY-MM') mth,
         CREATED_AT_TZ::DATE d, CUSTOMER_ID pid, TOTAL_PRICE rev
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND ORDER_STATUS = 'COMPLETED'
    AND CREATED_AT_TZ >= '2026-01-01' AND CREATED_AT_TZ < '2026-08-01'
    AND CUSTOMER_ID IS NOT NULL AND CUSTOMER_ID <> ''
), pm AS (
  SELECT COALESCE(venue,'*') venue, mth, pid, COUNT(DISTINCT d) vis, SUM(rev) rev
  FROM o GROUP BY GROUPING SETS ((venue,mth,pid),(mth,pid))
), fl AS (
  SELECT venue, mth, pid, vis, rev,
         LAG(mth) OVER (PARTITION BY venue, pid ORDER BY mth) prevm,
         MIN(mth) OVER (PARTITION BY venue, pid)              firstm
  FROM pm
)
SELECT venue, mth, COUNT(*) persons, SUM(vis) visits, ROUND(SUM(rev),2) rev,
       SUM(IFF(firstm = mth, 1, 0)) new_p,
       SUM(IFF(prevm = TO_CHAR(DATEADD('month', -1, TO_DATE(mth || '-01')), 'YYYY-MM'), 1, 0)) ret_p
FROM fl GROUP BY 1,2;

-- cross-venue pairwise overlap
WITH vv AS (
  SELECT pid, ARRAY_AGG(DISTINCT venue) vs, COUNT(DISTINCT venue) nv
  FROM pm WHERE venue <> '*' GROUP BY 1
)
SELECT a.value::STRING v1, b.value::STRING v2, COUNT(*) n
FROM vv, LATERAL FLATTEN(vv.vs) a, LATERAL FLATTEN(vv.vs) b
WHERE a.value::STRING < b.value::STRING GROUP BY 1,2;


-- ---------------------------------------------------------------------------
-- 8. PROMOTIONS AND DISCOUNTS
--    Five categories, auto-classified from the POS discount tag.
--    Category "revenue" is the FULL basket value of every TX carrying at least
--    one line in that category — a TX touched by two categories is counted in
--    BOTH, so category rows over-count against the whole. The TOTAL row uses a
--    deduplicated TX count. "$ given" is honest at every level because one
--    discount line carries exactly one tag.
-- ---------------------------------------------------------------------------
WITH o AS (
  SELECT ORDER_ID, VENUE_NAME venue, TO_CHAR(DATE_TRUNC('month', CREATED_AT_TZ),'YYYY-MM') mth,
         TOTAL_PRICE rev, IFF(CUSTOMER_ID IS NOT NULL AND CUSTOMER_ID <> '', 1, 0) ismem
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND ORDER_STATUS = 'COMPLETED'
    AND CREATED_AT_TZ >= '2026-01-01' AND CREATED_AT_TZ < '2026-08-01'
), a AS (
  SELECT ORDER_ID, TRIM(NAME) tag, -AMOUNT disc, ITEMS_COUNT ic,
    CASE WHEN TRIM(NAME) IN ('Promo Beverage','Promo Food','Two For One','Happy Hour','Promotions',
                             'Tac Promotions','Bottomless Lunch','Ugly 20% Off','Beverage & Food','Sports Award') THEN 'Promotion'
         WHEN TRIM(NAME) IN ('Members','Points Redeem','Member Surcharge')                    THEN 'Member'
         WHEN TRIM(NAME) IN ('Birthday Voucher')                                              THEN 'Voucher'
         WHEN TRIM(NAME) IN ('Staff Discount','Add - H/O Staff','Staff Incentive','Recovery Ea') THEN 'Staff'
         ELSE 'Manual' END cat
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDER_ADJUSTMENTS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND ADJUSTMENT_TYPE = 'DISCOUNT'
), j AS (SELECT o.venue, o.mth, o.rev, o.ismem, o.ORDER_ID, a.tag, a.cat, a.disc, a.ic FROM a JOIN o USING (ORDER_ID)),
tagrev AS (
  SELECT venue, mth, cat, tag, ORDER_ID, MAX(rev) rev, SUM(disc) disc, COUNT(*) lines, SUM(ic) units
  FROM j GROUP BY 1,2,3,4,5
),
dedup AS (SELECT venue, mth, ORDER_ID, MAX(rev) rev, SUM(disc) disc, MAX(ismem) ismem FROM j GROUP BY 1,2,3)
-- per tag
SELECT COALESCE(venue,'*') venue, COALESCE(mth,'*') mth, cat, tag,
       COUNT(*) txs, ROUND(SUM(rev),2) imp_rev, ROUND(SUM(disc),2) disc, SUM(lines) lines
FROM tagrev GROUP BY GROUPING SETS ((venue,mth,cat,tag),(venue,cat,tag),(mth,cat,tag),(cat,tag));
-- deduplicated impact: SELECT ... FROM dedup GROUP BY GROUPING SETS ((venue,mth),(venue),(mth),())


-- ---------------------------------------------------------------------------
-- 9. DAYPART CROSSOVER (visit level)
--    Seven patterns: L / H / D / LH / HD / LD / LHD. Hours 00:00-03:59 group with
--    DINNER of the same calendar date, so a 1am drink closes out the night it
--    belongs to rather than opening a new one.
-- ---------------------------------------------------------------------------
WITH o AS (
  SELECT VENUE_NAME venue, TO_CHAR(DATE_TRUNC('month', CREATED_AT_TZ),'YYYY-MM') mth,
    CREATED_AT_TZ::DATE d,
    COALESCE(NULLIF(CUSTOMER_ID,''), 'U:' || ORDER_ID) pid,
    IFF(CUSTOMER_ID IS NOT NULL AND CUSTOMER_ID <> '', 'Member', 'Unidentified') kind,
    TOTAL_PRICE rev,
    CASE WHEN HOUR(CREATED_AT_TZ) < 4  THEN 'D'
         WHEN HOUR(CREATED_AT_TZ) < 15 THEN 'L'
         WHEN HOUR(CREATED_AT_TZ) < 18 THEN 'H' ELSE 'D' END dp
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND ORDER_STATUS = 'COMPLETED'
    AND CREATED_AT_TZ >= '2026-01-01' AND CREATED_AT_TZ < '2026-08-01'
), v AS (
  SELECT venue, mth, pid, d, MAX(kind) kind, SUM(rev) rev, COUNT(*) tx,
         IFF(MAX(IFF(dp='L',1,0)) = 1, 'L', '') ||
         IFF(MAX(IFF(dp='H',1,0)) = 1, 'H', '') ||
         IFF(MAX(IFF(dp='D',1,0)) = 1, 'D', '') pat
  FROM o GROUP BY 1,2,3,4
)
SELECT COALESCE(venue,'*') venue, COALESCE(mth,'*') mth, pat,
       COUNT(*) visits, ROUND(SUM(rev),2) rev, SUM(tx) tx, SUM(IFF(kind='Member',1,0)) mem
FROM v GROUP BY GROUPING SETS ((venue,mth,pat),(venue,pat),(mth,pat),(pat));


-- ---------------------------------------------------------------------------
-- 10. PRODUCT PRICE LIST — drives the What-If price modelling
--     Menu price is the MEDIAN unit price, which is robust to the promotional
--     and staff-priced tail that would drag a mean.
-- ---------------------------------------------------------------------------
WITH o AS (
  SELECT ORDER_ID, VENUE_NAME venue
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND ORDER_STATUS = 'COMPLETED'
    AND CREATED_AT_TZ >= '2026-01-01' AND CREATED_AT_TZ < '2026-08-01'
), i AS (
  SELECT ORDER_ID, PRODUCT_NAME pn, PRODUCT_TYPE_NAME pt, QUANTITY q,
         TOTAL_PRICE amt, COST_PRICE cost, UNIT_PRICE up
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDER_ITEMS
  WHERE ORGANIZATION_ID = '01KYKN7DW3KYYV1B6K539CB5F2' AND COALESCE(TOTAL_PRICE,0) <> 0
), j AS (SELECT o.venue, i.* FROM i JOIN o USING (ORDER_ID))
SELECT COALESCE(venue,'*') venue, pn, ANY_VALUE(pt) pt,
       ROUND(SUM(q)) qty, ROUND(SUM(amt),2) rev, ROUND(SUM(cost),2) cost, ROUND(MEDIAN(up),2) price
FROM j GROUP BY GROUPING SETS ((venue,pn),(pn))
QUALIFY ROW_NUMBER() OVER (PARTITION BY COALESCE(venue,'*') ORDER BY SUM(amt) DESC) <= 60;


-- ---------------------------------------------------------------------------
-- 11. RECONCILIATION INVARIANTS — run these before shipping a rebuild.
--     Every one held on the 2026-01-01 .. 2026-07-31 window.
--
--   member TX + non-member TX                    = 1,813,956
--   food + bev + other revenue                   = $51,788,112
--   daypart TX (Lunch + Happy + Dinner)          = 1,813,956
--   heatmap cells summed (4am boundary applied)  = 1,813,956
--   crossover patterns summed (7 patterns)       = 1,813,956 TX / $51,788,112
--   frequency cohorts summed                     = 102,779 members / 1,227,612 TX
--
--   NOTE: summing VISITS across revenue centres, or across dayparts, deliberately
--   over-counts — one guest-day can touch several revenue centres and several
--   bands. Venue-level and crossover-level figures are the source of truth.
-- ---------------------------------------------------------------------------
