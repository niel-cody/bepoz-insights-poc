import React, { useCallback, useMemo, useState } from 'react'
import { ALL, Bench, Dataset, monthLabel, n0, unlock, venueCode } from './lib'
import { LockStatus, LoginScreen, useIdleLock } from './components/Lock'

import Benchmark from './tabs/Benchmark'
import Members from './tabs/Members'
import Promotions from './tabs/Promotions'
import Trading from './tabs/Trading'
import WhatIf from './tabs/WhatIf'
import Methodology from './tabs/Methodology'

import Overview from './v2/Overview'
import Daily from './v2/Daily'
import BenchmarkV2 from './v2/Benchmark'
import MembersV2 from './v2/Members'
import PromotionsV2 from './v2/Promotions'
import TradingV2 from './v2/Trading'
import WhatIfV2 from './v2/WhatIf'

type Edition = 'classic' | 'new'

// Classic is the frozen snapshot: the build Feros has already seen, untouched.
// New is where the product is going. Tab keys are shared so switching edition
// keeps you on the same subject rather than resetting you to the front.
const TABS: Record<Edition, { k: string; label: string }[]> = {
  classic: [
    { k: 'bench', label: 'Benchmark' },
    { k: 'members', label: 'Member analysis' },
    { k: 'promos', label: 'Promotions & discounts' },
    { k: 'trading', label: 'Trading patterns' },
    { k: 'whatif', label: 'What-if' },
    { k: 'method', label: 'Methodology' },
  ],
  new: [
    { k: 'overview', label: 'Overview' },
    { k: 'bench', label: 'Venues' },
    { k: 'daily', label: 'Days' },
    { k: 'trading', label: 'Trading patterns' },
    { k: 'members', label: 'Members' },
    { k: 'promos', label: 'Discounting' },
    { k: 'whatif', label: 'What-if' },
    { k: 'method', label: 'Methodology' },
  ],
}

export default function App() {
  const [ds, setDs] = useState<Dataset | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [edition, setEdition] = useState<Edition>('classic')
  const [tab, setTab] = useState('bench')
  const [month, setMonth] = useState(ALL)
  const [venue, setVenue] = useState(ALL)
  const [picked, setPicked] = useState<string[]>([])
  const [modelTag, setModelTag] = useState<string | null>(null)

  const lock = useCallback((viaTimeout: boolean) => {
    setDs(null); setTimedOut(viaTimeout)
    setPicked([]); setMonth(ALL); setVenue(ALL); setTab('bench'); setEdition('classic')
  }, [])
  const onIdle = useCallback(() => lock(true), [lock])
  const idleFor = useIdleLock(!!ds, onIdle)

  const bench = useMemo(() => (ds ? new Bench(ds.bench) : null), [ds])

  if (!ds || !bench) {
    return <LoginScreen wasTimedOut={timedOut}
      onSubmit={async pw => { const d = await unlock(pw); setDs(d); setTimedOut(false) }} />
  }

  const tabs = TABS[edition]
  const activeTab = tabs.some(t => t.k === tab) ? tab : tabs[0].k
  const venueList = picked.length ? picked : ds.venues
  // v2 uses one filter vocabulary everywhere: a single venue selection that
  // every page honours. Classic keeps its original split behaviour untouched.
  const scopeVenue = edition === 'new' ? venue : activeTab === 'bench' ? ALL : venue

  const switchEdition = (e: Edition) => {
    setEdition(e)
    const next = TABS[e]
    if (!next.some(t => t.k === activeTab)) setTab(next[0].k)
  }

  const go = (t: string, v?: string) => { setTab(t); if (v) setVenue(v) }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brandrow">
            <div className="brand">Feros Group <span>·</span> Strategic Review</div>
            <div className="brand-sub">
              {ds.meta.venues} venues · {ds.meta.revenueCentres} revenue centres · {monthLabel(ds.months[0])} to {monthLabel(ds.months[ds.months.length - 1])}
            </div>
            <div className="brand-spacer" />
            <div className="edition" role="group" aria-label="Edition">
              <button className={edition === 'classic' ? 'on' : ''} onClick={() => switchEdition('classic')}
                title="The build already shared with Feros, frozen and unchanged">Classic</button>
              <button className={edition === 'new' ? 'on' : ''} onClick={() => switchEdition('new')}
                title="Rebuilt against the product council review">New</button>
            </div>
            <LockStatus idleFor={idleFor} onLock={() => lock(false)} />
          </div>
          <div className="tabs">
            {tabs.map(t => (
              <button key={t.k} className={'tab' + (activeTab === t.k ? ' on' : '')} onClick={() => setTab(t.k)}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="shell">
        {activeTab !== 'method' && (
          <div className="filterband">
            <div className="frow">
              <div className="flabel">Month</div>
              <button className={'chip' + (month === ALL ? ' on' : '')} onClick={() => setMonth(ALL)}>All months</button>
              {ds.months.map(m => (
                <button key={m} className={'chip' + (month === m ? ' on' : '')} onClick={() => setMonth(m)}>{monthLabel(m)}</button>
              ))}
            </div>
            {edition === 'classic' && activeTab === 'bench' ? (
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

        {edition === 'classic' && <>
          {activeTab === 'bench' && <Benchmark ds={ds} bench={bench} month={month} venues={venueList} />}
          {activeTab === 'members' && <Members ds={ds} bench={bench} month={month} venue={scopeVenue} />}
          {activeTab === 'promos' && <Promotions ds={ds} bench={bench} venue={scopeVenue} month={month} />}
          {activeTab === 'trading' && <Trading ds={ds} venue={scopeVenue} month={month} />}
          {activeTab === 'whatif' && <WhatIf ds={ds} bench={bench} venue={scopeVenue} month={month} />}
          {activeTab === 'method' && <Methodology ds={ds} bench={bench} />}
        </>}

        {edition === 'new' && <>
          {activeTab === 'overview' && <Overview ds={ds} bench={bench} month={month} onGo={go} />}
          {activeTab === 'bench' && <BenchmarkV2 ds={ds} bench={bench} month={month} venues={venue === ALL ? ds.venues : [venue]} />}
          {activeTab === 'daily' && <Daily ds={ds} venue={scopeVenue} month={month} />}
          {activeTab === 'trading' && <TradingV2 ds={ds} bench={bench} venue={scopeVenue} month={month} />}
          {activeTab === 'members' && <MembersV2 ds={ds} bench={bench} month={month} venue={scopeVenue} />}
          {activeTab === 'promos' && <PromotionsV2 ds={ds} bench={bench} venue={scopeVenue} month={month}
            onModel={t => { setModelTag(t); setTab('whatif') }} />}
          {activeTab === 'whatif' && <WhatIfV2 ds={ds} bench={bench} venue={scopeVenue} month={month}
            preload={modelTag} onPreloadConsumed={() => setModelTag(null)} />}
          {activeTab === 'method' && <Methodology ds={ds} bench={bench} />}
        </>}

        <div className="foot">
          {edition === 'classic'
            ? <>Classic edition, frozen as shared with Feros. Switch to New to see the build rebuilt against the product council review.</>
            : <>New edition. Every page opens with a judgement rather than a number, and every comparison names what it is measured against.</>}
          <br />
          Built from {ds.meta.source} · organisation {ds.meta.orgId} · {n0(ds.bench.filter(b => b.v !== ALL && b.rc !== ALL && b.m !== ALL).length)} aggregate cells
          <br />
          Commercial in confidence · this session locks after 30 minutes of inactivity.
        </div>
      </div>
    </>
  )
}
