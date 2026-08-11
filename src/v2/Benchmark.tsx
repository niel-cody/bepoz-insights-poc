import React, { useMemo, useState } from 'react'
import {
  ALL, Bench, Cell, Dataset, Seg as SegT, compact, delta, itemsPerTx, money, monthLabel, n0, n1, n2, pct,
  perPerson, perTx, perVisit, prevMonth, venueCode, venueIndex, visPerPerson,
} from '../lib'
import { Seg } from '../components/ui'
import { Caveat, DeltaTag, IndexBar, JudgedKpi, Sortable, Standfirst } from '../components/v2ui'

/**
 * The table survives, because two multi-venue operator personas need lookup at
 * this grain and the council refused to cut it. What changes is that it now
 * carries a judgement: every venue is indexed against the group average and
 * shows its movement on the previous month, and it sorts by whatever the reader
 * is actually asking about.
 *
 * Closes VPC-FSR-001 and VPC-FSR-004.
 */

type Row = { kind: 'venue' | 'rc'; venue: string; label: string; c: Cell; p: Cell | null }

const COLS = [
  { id: 'rev', label: 'Revenue', get: (c: Cell) => c.rev, fmt: money, money: true },
  { id: 'tx', label: 'TX', get: (c: Cell) => c.tx, fmt: n0 },
  { id: 'vis', label: 'Visits', get: (c: Cell) => c.vis, fmt: n0 },
  { id: 'ppl', label: 'People', get: (c: Cell) => c.ppl, fmt: n0 },
  { id: 'atv', label: '$ / TX', get: perTx, fmt: (v: number) => '$' + n2(v) },
  { id: 'pv', label: '$ / visit', get: perVisit, fmt: (v: number) => '$' + n2(v) },
  { id: 'pp', label: '$ / person', get: perPerson, fmt: (v: number) => '$' + n0(v) },
  { id: 'vpp', label: 'Visits / person', get: visPerPerson, fmt: n2 },
  { id: 'ipt', label: 'Items / TX', get: itemsPerTx, fmt: n2 },
  { id: 'food', label: 'Food %', get: (c: Cell) => (c.food + c.bev ? c.food / (c.food + c.bev) : NaN), fmt: (v: number) => pct(v, 0) },
]

export default function BenchmarkV2({ ds, bench, month, venues }: { ds: Dataset; bench: Bench; month: string; venues: string[] }) {
  const [seg, setSeg] = useState<SegT>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [sort, setSort] = useState<{ by: string; dir: 1 | -1 }>({ by: 'rev', dir: -1 })

  const prior = month === ALL ? null : prevMonth(ds, month)
  const total = bench.get(ALL, ALL, month, seg)
  const totalPrev = prior ? bench.get(ALL, ALL, prior, seg) : null

  const onSort = (id: string) =>
    setSort(s => (s.by === id ? { by: id, dir: (s.dir * -1) as 1 | -1 } : { by: id, dir: -1 }))

  const rows = useMemo(() => {
    const col = COLS.find(c => c.id === sort.by)
    const venueRows = venues
      .map(v => ({
        kind: 'venue' as const, venue: v, label: v,
        c: bench.get(v, ALL, month, seg),
        p: prior ? bench.get(v, ALL, prior, seg) : null,
      }))
      .filter(r => r.c.tx > 0)
      .sort((a, b) => {
        if (sort.by === 'name') return a.label.localeCompare(b.label) * sort.dir * -1
        if (sort.by === 'move') {
          const da = delta(a.c.rev, a.p?.rev ?? NaN).pct, db = delta(b.c.rev, b.p?.rev ?? NaN).pct
          return ((isFinite(db) ? db : -Infinity) - (isFinite(da) ? da : -Infinity)) * (sort.dir === -1 ? 1 : -1)
        }
        const va = col ? col.get(a.c) : 0, vb = col ? col.get(b.c) : 0
        return ((isFinite(vb) ? vb : -Infinity) - (isFinite(va) ? va : -Infinity)) * (sort.dir === -1 ? 1 : -1)
      })

    const out: Row[] = []
    for (const r of venueRows) {
      out.push(r)
      if (expanded[r.venue]) {
        for (const rc of ds.rcs[r.venue] || []) {
          const c = bench.get(r.venue, rc, month, seg)
          if (c.tx > 0) out.push({ kind: 'rc', venue: r.venue, label: rc, c, p: prior ? bench.get(r.venue, rc, prior, seg) : null })
        }
      }
    }
    return out
  }, [ds, bench, month, prior, seg, venues, expanded, sort])

  const venueCount = rows.filter(r => r.kind === 'venue').length

  return (
    <>
      <Standfirst
        question="Which venues are carrying the group, and which are drifting?"
        sub={prior
          ? `${monthLabel(month)} against ${monthLabel(prior)}. Index 100 is the group average, so a venue at 140 is doing 1.4 times an average venue's trade.`
          : `${monthLabel(month)}. Index 100 is the group average. Pick a single month to see movement against the month before.`}
      />

      <div className="frow" style={{ marginBottom: 14 }}>
        <div className="flabel">Cohort</div>
        <Seg value={seg} onChange={k => setSeg(k as SegT)}
          options={[{ k: 'all', label: 'Total' }, { k: 'member', label: 'Members' }, { k: 'nonmember', label: 'Non-members' }]} />
        <div style={{ flex: 1 }} />
        <button className="chip" onClick={() => setExpanded(Object.fromEntries(venues.map(v => [v, true])))}>Expand all</button>
        <button className="chip" onClick={() => setExpanded({})}>Collapse all</button>
      </div>

      <div className="kpis" style={{ marginBottom: 16 }}>
        <JudgedKpi hero label="Revenue" value={compact(total.rev)} delta={delta(total.rev, totalPrev?.rev ?? NaN)} />
        <JudgedKpi label="Average transaction" value={'$' + n1(perTx(total))} delta={delta(perTx(total), totalPrev ? perTx(totalPrev) : NaN)} />
        <JudgedKpi label="Visits" value={n0(total.vis)} delta={delta(total.vis, totalPrev?.vis ?? NaN)} />
        <JudgedKpi label="$ per visit" value={'$' + n1(perVisit(total))} delta={delta(perVisit(total), totalPrev ? perVisit(totalPrev) : NaN)} />
        <JudgedKpi label="Items per transaction" value={n2(itemsPerTx(total))} delta={delta(itemsPerTx(total), totalPrev ? itemsPerTx(totalPrev) : NaN)} />
      </div>

      <div className="tw">
        <table className="v2t">
          <thead>
            <tr className="head">
              <Sortable id="name" sort={sort} onSort={onSort} className="l sticky-l">Venue</Sortable>
              <Sortable id="move" sort={sort} onSort={onSort}>vs prior month</Sortable>
              <th style={{ width: 120 }}>vs group avg</th>
              {COLS.map(c => <Sortable key={c.id} id={c.id} sort={sort} onSort={onSort}>{c.label}</Sortable>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const d = delta(r.c.rev, r.p?.rev ?? NaN)
              const idx = r.kind === 'venue' ? venueIndex(r.c.rev, total.rev, venueCount) : NaN
              return (
                <tr key={r.kind + r.venue + r.label} className={r.kind === 'venue' ? 'venue' : 'sub'}>
                  <td className="l sticky-l">
                    {r.kind === 'venue' ? (
                      <span style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => ({ ...e, [r.venue]: !e[r.venue] }))}>
                        <span style={{ color: 'var(--accent)', marginRight: 7, fontSize: 11 }}>{expanded[r.venue] ? '▾' : '▸'}</span>
                        <span className="tag" style={{ marginRight: 8 }}>{venueCode(ds, r.venue)}</span>{r.label}
                      </span>
                    ) : r.label}
                  </td>
                  <td className="num"><DeltaTag d={d} abs={v => money(v)} /></td>
                  <td>{r.kind === 'venue' && isFinite(idx) ? <IndexBar index={idx} /> : null}</td>
                  {COLS.map(c => <td key={c.id} className="num">{c.fmt(c.get(r.c))}</td>)}
                </tr>
              )
            })}
            <tr className="total">
              <td className="l sticky-l">Feros Group</td>
              <td className="num"><DeltaTag d={delta(total.rev, totalPrev?.rev ?? NaN)} /></td>
              <td />
              {COLS.map(c => <td key={c.id} className="num">{c.fmt(c.get(total))}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {!prior && (
        <Caveat>
          Movement needs two periods. With "all months" selected there is nothing to compare against, so the
          comparison column is empty by design rather than by accident. Choose a single month to fill it.
        </Caveat>
      )}

      <details className="sec" style={{ marginTop: 16 }}>
        <summary>How to read this table<span className="cnt">definitions and known divergences</span></summary>
        <div className="body" style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-2)' }}>
          A <b>visit</b> is one person at one venue on one calendar day, so seven transactions across lunch and dinner
          at one venue is one visit. A <b>person</b> is one identity across the whole selected period, which is why
          $ / person is value over the window rather than per day. <b>Index</b> compares a venue's revenue to the
          average of the {venueCount} venues trading in this period, where 100 is exactly average.
          <br /><br />
          Two things over-count on purpose and are worth knowing. Revenue-centre visits sum higher than the venue
          total, because a guest who drinks in the Public Bar and eats in the Bistro on one day is one visit in each.
          Non-member person counts are an upper bound, because an unidentified transaction cannot be told apart from
          another one.
        </div>
      </details>
    </>
  )
}
