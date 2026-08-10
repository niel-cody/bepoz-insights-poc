import React, { useEffect, useMemo, useState } from 'react'
import { ALL, Bench, Dataset, compact, loadDataset, monthLabel, n0, venueCode } from './lib'
import Benchmark from './tabs/Benchmark'
import Members from './tabs/Members'
import Promotions from './tabs/Promotions'
import Trading from './tabs/Trading'
import WhatIf from './tabs/WhatIf'
import Methodology from './tabs/Methodology'

const TABS = [
  { k: 'bench', label: 'Benchmark' },
  { k: 'members', label: 'Member analysis' },
  { k: 'promos', label: 'Promotions & discounts' },
  { k: 'trading', label: 'Trading patterns' },
  { k: 'whatif', label: 'What-if' },
  { k: 'method', label: 'Methodology' },
]

export default function App() {
  const [ds, setDs] = useState<Dataset | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState('bench')
  const [month, setMonth] = useState(ALL)
  const [venue, setVenue] = useState(ALL)
  const [picked, setPicked] = useState<string[]>([])

  useEffect(() => { loadDataset().then(setDs).catch(e => setErr(String(e))) }, [])

  const bench = useMemo(() => (ds ? new Bench(ds.bench) : null), [ds])

  if (err) return <div className="loading">Could not load the dataset — {err}</div>
  if (!ds || !bench) return <div className="loading">Loading Feros Group data…</div>

  const venueList = picked.length ? picked : ds.venues
  const scopeVenue = tab === 'bench' ? ALL : venue

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brandrow">
            <div className="brand">Feros Group <span>·</span> Strategic Review</div>
            <div className="brand-sub">
              {ds.meta.venues} venues · {ds.meta.revenueCentres} revenue centres · {monthLabel(ds.months[0])} – {monthLabel(ds.months[ds.months.length - 1])}
            </div>
            <div className="brand-spacer" />
            <div className="brand-sub">Oolio Atlas · built on Snowflake</div>
          </div>
          <div className="tabs">
            {TABS.map(t => (
              <button key={t.k} className={'tab' + (tab === t.k ? ' on' : '')} onClick={() => setTab(t.k)}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="shell">
        {tab !== 'method' && (
          <div className="filterband">
            <div className="frow">
              <div className="flabel">Month</div>
              <button className={'chip' + (month === ALL ? ' on' : '')} onClick={() => setMonth(ALL)}>All months</button>
              {ds.months.map(m => (
                <button key={m} className={'chip' + (month === m ? ' on' : '')} onClick={() => setMonth(m)}>{monthLabel(m)}</button>
              ))}
            </div>
            {tab === 'bench' ? (
              <div className="frow">
                <div className="flabel">Venues shown</div>
                <button className={'chip ghost' + (!picked.length ? ' on' : '')} onClick={() => setPicked([])}>All {ds.venues.length}</button>
                {ds.venues.map(v => (
                  <button key={v} className={'chip ghost' + (picked.includes(v) ? ' on' : '')}
                    onClick={() => setPicked(p => (p.includes(v) ? p.filter(x => x !== v) : [...p, v]))}>
                    {venueCode(ds, v)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="frow">
                <div className="flabel">Venue</div>
                <button className={'chip' + (venue === ALL ? ' on' : '')} onClick={() => setVenue(ALL)}>All venues</button>
                {ds.venues.map(v => (
                  <button key={v} className={'chip' + (venue === v ? ' on' : '')} onClick={() => setVenue(v)}>{v}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'bench' && <Benchmark ds={ds} bench={bench} month={month} venues={venueList} />}
        {tab === 'members' && <Members ds={ds} bench={bench} month={month} venue={scopeVenue} />}
        {tab === 'promos' && <Promotions ds={ds} bench={bench} venue={scopeVenue} month={month} />}
        {tab === 'trading' && <Trading ds={ds} venue={scopeVenue} month={month} />}
        {tab === 'whatif' && <WhatIf ds={ds} bench={bench} venue={scopeVenue} month={month} />}
        {tab === 'method' && <Methodology ds={ds} bench={bench} />}

        <div style={{ marginTop: 32, fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.8 }}>
          Built from {ds.meta.source} · organisation {ds.meta.orgId} · {n0(ds.bench.filter(b => b.v !== ALL && b.rc !== ALL && b.m !== ALL).length)} aggregate cells<br />
          Measure definitions carried unchanged from the original Feros strategic review · see the Methodology tab for divergences.
        </div>
      </div>
    </>
  )
}
