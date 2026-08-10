import React, { useMemo, useState } from 'react'
import {
  ALL, Bench, Cell, Dataset, Seg as SegT, compact, itemsPerTx, money, n0, n1, n2, monthLabel,
  perItem, perPerson, perTx, perVisit, tender, txPerPerson, txPerVisit, venueCode, visPerPerson, pct,
} from '../lib'
import { Card, Kpi, Note, Seg } from '../components/ui'

const BANDS: { label: string; cols: string[] }[] = [
  { label: 'Revenue breakdown', cols: ['Menu revenue', 'Food $', 'Bev $'] },
  { label: 'Payments (tendered)', cols: ['Card $', 'Cash $', 'Voucher $', 'Comp $', 'Account $'] },
  { label: 'Volume', cols: ['Total people', 'Total visits', 'Total TX', 'Total items'] },
  { label: 'Average spend', cols: ['$ / person', '$ / visit', '$ / TX', '$ / item'] },
  { label: 'Ratios', cols: ['Visits / person', 'TX / person', 'TX / visit', 'Items / TX'] },
]

function cells(c: Cell): string[] {
  return [
    money(c.rev), money(c.food), money(c.bev),
    money(c.card), money(c.cash), money(c.vouch), money(c.comp), money(c.acct),
    n0(c.ppl), n0(c.vis), n0(c.tx), n0(c.items),
    money2(perPerson(c)), money2(perVisit(c)), money2(perTx(c)), money2(perItem(c)),
    n2(visPerPerson(c)), n2(txPerPerson(c)), n2(txPerVisit(c)), n2(itemsPerTx(c)),
  ]
}
const money2 = (x: number) => (isFinite(x) ? (x < 0 ? '-$' : '$') + Math.abs(x).toFixed(2) : '—')

export default function Benchmark({ ds, bench, month, venues }: { ds: Dataset; bench: Bench; month: string; venues: string[] }) {
  const [seg, setSeg] = useState<SegT>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const total = bench.get(ALL, ALL, month, seg)
  const totalAll = bench.get(ALL, ALL, month, 'all')

  const rows = useMemo(() => {
    const out: { kind: 'venue' | 'rc'; venue: string; label: string; c: Cell }[] = []
    for (const v of venues) {
      out.push({ kind: 'venue', venue: v, label: v, c: bench.get(v, ALL, month, seg) })
      if (expanded[v]) {
        for (const rc of ds.rcs[v] || []) {
          out.push({ kind: 'rc', venue: v, label: rc, c: bench.get(v, rc, month, seg) })
        }
      }
    }
    return out
  }, [ds, bench, month, seg, venues, expanded])

  const memberShare = totalAll.rev ? bench.get(ALL, ALL, month, 'member').rev / totalAll.rev : 0
  const foodShare = total.food + total.bev ? total.food / (total.food + total.bev) : 0
  const tenderGap = total.rev ? (tender(total) - total.rev) / total.rev : 0

  return (
    <>
      <div className="frow" style={{ marginBottom: 14 }}>
        <div className="flabel">Cohort</div>
        <Seg
          value={seg}
          onChange={k => setSeg(k as SegT)}
          options={[{ k: 'all', label: 'Total' }, { k: 'member', label: 'Members' }, { k: 'nonmember', label: 'Non-members' }]}
        />
        <div style={{ flex: 1 }} />
        <button className="chip" onClick={() => setExpanded(Object.fromEntries(venues.map(v => [v, true])))}>Expand all</button>
        <button className="chip" onClick={() => setExpanded({})}>Collapse all</button>
      </div>

      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi label="Menu revenue" value={compact(total.rev)} detail={<>{monthLabel(month)} · <b>{seg === 'all' ? 'all guests' : seg === 'member' ? 'members' : 'non-members'}</b></>} />
        <Kpi label="Transactions" value={n0(total.tx)} detail={<>ATV <b>{money2(perTx(total))}</b></>} />
        <Kpi label="Visits" value={n0(total.vis)} detail={<>{money2(perVisit(total))} <b>/ visit</b></>} />
        <Kpi label="People" value={n0(total.ppl)} detail={<>{money2(perPerson(total))} <b>/ person</b></>} />
        <Kpi label="Items sold" value={n0(total.items)} detail={<>{n2(itemsPerTx(total))} <b>items / TX</b></>} />
        <Kpi label="Food : Bev" value={pct(foodShare, 0) + ' : ' + pct(1 - foodShare, 0)} detail={<>{compact(total.food)} food · {compact(total.bev)} bev</>} />
        <Kpi label="Member share" value={pct(memberShare, 1)} detail={<>of group revenue</>} />
        <Kpi label="Discount given" value={compact(total.disc)} detail={<>{pct(total.rev ? total.disc / (total.rev + total.disc) : 0, 1)} <b>of gross</b></>} />
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr className="band">
              <th className="l sticky-l" rowSpan={2} style={{ minWidth: 210 }}>Venue / revenue centre</th>
              {BANDS.map(b => <th key={b.label} colSpan={b.cols.length} className="sep">{b.label}</th>)}
            </tr>
            <tr className="head">
              {BANDS.flatMap(b => b.cols.map((c, i) => <th key={b.label + c} className={i === 0 ? 'sep' : ''}>{c}</th>))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const vals = cells(r.c)
              const seps = new Set([0, 3, 8, 12, 16])
              return (
                <tr key={r.kind + r.venue + r.label} className={r.kind === 'venue' ? 'venue' : 'sub'}>
                  <td className="l sticky-l">
                    {r.kind === 'venue' ? (
                      <span style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => ({ ...e, [r.venue]: !e[r.venue] }))}>
                        <span style={{ color: 'var(--accent)', marginRight: 7, fontSize: 11 }}>{expanded[r.venue] ? '▾' : '▸'}</span>
                        <span className="tag" style={{ marginRight: 8 }}>{venueCode(ds, r.venue)}</span>
                        {r.label}
                      </span>
                    ) : r.label}
                  </td>
                  {vals.map((v, i) => <td key={i} className={'num' + (seps.has(i) ? ' sep' : '')}>{v}</td>)}
                </tr>
              )
            })}
            <tr className="total">
              <td className="l sticky-l">Feros Group — all venues</td>
              {cells(total).map((v, i) => <td key={i} className={'num' + ([0, 3, 8, 12, 16].includes(i) ? ' sep' : '')}>{v}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <Note>
        <ul>
          <li><b>Visit</b> = one person, one venue, one calendar day. Seven transactions across lunch and dinner at one venue is <b>one visit</b>.</li>
          <li><b>Person</b> = one unique identity across the selected period — so <b>$ / person</b> is value over the whole window, not per day.</li>
          <li><b>Members</b> are orders carrying an Oolio One loyalty customer; <b>non-members</b> are unidentified, where each transaction counts as one person. Non-member person counts are therefore an <b>upper bound</b>.</li>
          <li><b>Revenue-centre visits over-count the venue total</b>: a guest transacting in both the Bistro and the Gaming Bar on one day is one visit per revenue centre but one visit at venue level. Use the venue row as the source of truth at rollup.</li>
          <li><b>Items</b> exclude condiments, modifiers, zero-price and "add" lines, using the same classifier as the original review — 19% of all sold lines, but only 1% of revenue.</li>
          <li><b>Tendered payments</b> run {pct(tenderGap, 1)} above menu revenue for this selection. Cash over-tender (change is not written back as a negative tender line) and on-account settlement account for the gap; the payment columns are a channel-mix view, not a second revenue total.</li>
        </ul>
      </Note>
    </>
  )
}
