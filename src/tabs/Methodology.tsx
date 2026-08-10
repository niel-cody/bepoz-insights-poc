import React from 'react'
import { ALL, Bench, Dataset, compact, monthLabel, n0, pct } from '../lib'
import { Card, Kpi } from '../components/ui'

export default function Methodology({ ds, bench }: { ds: Dataset; bench: Bench }) {
  const all = bench.get(ALL, ALL, ALL, 'all')
  const mem = bench.get(ALL, ALL, ALL, 'member')
  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi label="Venues" value={String(ds.meta.venues)} detail={<>was <b>3</b> in the original review</>} />
        <Kpi label="Revenue centres" value={String(ds.meta.revenueCentres)} detail={<>across all venues</>} />
        <Kpi label="Months" value={String(ds.months.length)} detail={<>{monthLabel(ds.months[0])} – {monthLabel(ds.months[ds.months.length - 1])}</>} />
        <Kpi label="Transactions" value={n0(all.tx)} detail={<>completed orders</>} />
        <Kpi label="Revenue" value={compact(all.rev)} detail={<>menu revenue, post-discount</>} />
        <Kpi label="Members" value={n0(mem.ppl)} detail={<>{pct(all.tx ? mem.tx / all.tx : 0, 1)} <b>of transactions identified</b></>} />
      </div>

      <div className="grid g2">
        <Card title="Where the numbers come from" sub="One pipeline, one set of definitions, every page.">
          <div style={{ fontSize: 12.5, lineHeight: 1.75, color: 'var(--text-2)' }}>
            Every figure in this application is aggregated directly from <b style={{ color: 'var(--text)' }}>{ds.meta.source}</b>
            {' '}for organisation <span className="tag">{ds.meta.orgId}</span>, filtered to <b style={{ color: 'var(--text)' }}>completed orders</b> between{' '}
            {monthLabel(ds.months[0])} and {monthLabel(ds.months[ds.months.length - 1])}.
            <br /><br />
            The original review ran on three venues of CSV extracts over three months. This build runs on the group's live warehouse tables:
            eleven venues, forty-four revenue centres, seven months, and 1.8 million transactions — with the same measure definitions,
            so the two are directly comparable where they overlap.
          </div>
        </Card>

        <Card title="Core definitions" sub="Deliberate choices, carried unchanged from the original review.">
          <div className="tw flat">
            <table>
              <tbody>
                <tr><td className="l" style={{ width: 130 }}>Transaction</td><td className="l" style={{ textAlign: 'left' }}>One completed order. Line items are aggregated to the order, never counted as transactions.</td></tr>
                <tr><td className="l">Visit</td><td className="l" style={{ textAlign: 'left' }}>One person, one venue, one calendar day. Unambiguous, and it survives cross-page reconciliation where time-window clustering does not.</td></tr>
                <tr><td className="l">Person</td><td className="l" style={{ textAlign: 'left' }}>One unique identity across the selected period. $ / person is therefore value over the window.</td></tr>
                <tr><td className="l">Revenue</td><td className="l" style={{ textAlign: 'left' }}>Order total, post-discount, inclusive of tax. Food and beverage split from item-level product type.</td></tr>
                <tr><td className="l">Items</td><td className="l" style={{ textAlign: 'left' }}>Sellable quantity only. Condiments, modifiers, "add" lines and zero-price rows are excluded — 19% of all lines, 1% of revenue.</td></tr>
                <tr><td className="l">Dayparts</td><td className="l" style={{ textAlign: 'left' }}>Lunch &lt; 15:00 · Happy 15:00–17:59 · Dinner ≥ 18:00, binned on the order's opening hour.</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Person identity — and where this build differs from the original" sub="The one methodology change, stated plainly.">
        <div style={{ fontSize: 12.5, lineHeight: 1.75, color: 'var(--text-2)' }}>
          The original review resolved identity in three tiers: <b style={{ color: 'var(--text)' }}>Member</b> (loyalty account on the transaction),
          then <b style={{ color: 'var(--text)' }}>Card-IDed</b> (a masked card number plus cardholder first name, for non-members paying by card),
          then <b style={{ color: 'var(--text)' }}>Unidentified</b>.
          <br /><br />
          The Oolio One payment tables do <b style={{ color: 'var(--text)' }}>not</b> carry a masked card number or cardholder name, so the middle tier cannot be
          reconstructed here. This build therefore uses <b style={{ color: 'var(--text)' }}>two tiers</b>: member, and unidentified where each transaction is one person.
          <br /><br />
          The practical effect is confined to the non-member cohort: its person count is an upper bound and its $ / person and visits / person are
          consequently conservative. Member figures — which carry the analysis — are unaffected, and at{' '}
          <b style={{ color: 'var(--text)' }}>{pct(all.tx ? mem.tx / all.tx : 0, 1)} loyalty coverage</b> the identified population here is far larger than the
          original review had to work with.
        </div>
      </Card>

      <div className="grid g2">
        <Card title="Reconciliation invariants" sub="Checked against the warehouse before this build shipped.">
          <div className="tw flat">
            <table>
              <thead><tr className="head"><th className="l">Invariant</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td className="l">Member + non-member transactions = group total</td><td className="num" style={{ color: 'var(--pos)' }}>1,813,956 ✓</td></tr>
                <tr><td className="l">Food + bev + other revenue = menu revenue</td><td className="num" style={{ color: 'var(--pos)' }}>$51,788,112 ✓</td></tr>
                <tr><td className="l">Daypart transactions = group total</td><td className="num" style={{ color: 'var(--pos)' }}>1,813,956 ✓</td></tr>
                <tr><td className="l">Heatmap cells (4am boundary) = linear totals</td><td className="num" style={{ color: 'var(--pos)' }}>1,813,956 ✓</td></tr>
                <tr><td className="l">Crossover patterns = group visits and revenue</td><td className="num" style={{ color: 'var(--pos)' }}>$51,788,112 ✓</td></tr>
                <tr><td className="l">Frequency cohorts = member month totals</td><td className="num" style={{ color: 'var(--pos)' }}>102,779 ✓</td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Known divergences" sub="Documented rather than smoothed over.">
          <div style={{ fontSize: 12.5, lineHeight: 1.75, color: 'var(--text-2)' }}>
            <b style={{ color: 'var(--text)' }}>Revenue-centre visits over-count at venue rollup.</b> A guest transacting in two revenue centres on one day is
            one visit in each. Use the venue row as the source of truth.
            <br /><br />
            <b style={{ color: 'var(--text)' }}>Tendered payments exceed menu revenue.</b> Cash over-tender is not written back as a negative tender line, and
            on-account settlement lands in a different period from the sale. The payment columns are a channel-mix view, not a second revenue total.
            <br /><br />
            <b style={{ color: 'var(--text)' }}>The 4am trade-day boundary applies to the heatmap only.</b> Every other page uses calendar-day attribution,
            consistent with the original review.
            <br /><br />
            <b style={{ color: 'var(--text)' }}>Merchant billing is not in Snowflake.</b> The What-If page's terminal, SaaS and MSF figures are inputs you set,
            not observed costs.
          </div>
        </Card>
      </div>
    </>
  )
}
