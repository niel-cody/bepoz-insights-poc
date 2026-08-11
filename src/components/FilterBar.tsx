import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Dataset, venueCode } from '../lib'
import {
  Period, Scope, isSingleMonth, isWholeGroup, isWholeWindow, latestMonth, monthName,
  periodLabel, scopeSentence, venueLabel, venuesOf, wholeWindow,
} from '../think/scope'

/**
 * The Thinking edition's filter bar.
 *
 * Chips were right for four options and wrong for fifty-five. Two controls, one
 * line, both of them dropdowns that hold search and hierarchy, and a sentence
 * underneath saying in words what is currently selected — because a page that
 * insists on naming its comparison should not make you reverse-engineer its
 * scope from which pill is lit.
 */

function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key) }
  }, [onClose])
  return ref
}

// ---------------------------------------------------------------------------
// Period: click a month for one month, shift-click to reach across to a range.
// ---------------------------------------------------------------------------
const PeriodPicker: React.FC<{ ds: Dataset; value: Period; onChange: (p: Period) => void; onClose: () => void }> =
({ ds, value, onChange, onClose }) => {
  const months = ds.months
  const inRange = (m: string) => m >= value.from && m <= value.to
  const pick = (m: string, extend: boolean) => {
    if (!extend) onChange({ from: m, to: m })
    else onChange(m < value.from ? { from: m, to: value.to } : { from: value.from, to: m })
    if (!extend) onClose()
  }
  const last3 = (): Period => {
    const i = Math.max(0, months.length - 3)
    return { from: months[i], to: months[months.length - 1] }
  }
  return (
    <div className="pop period-pop">
      <div className="pop-side">
        <button className={isWholeWindow(ds, value) ? 'on' : ''} onClick={() => { onChange(wholeWindow(ds)); onClose() }}>All months</button>
        <button onClick={() => { onChange(latestMonth(ds)); onClose() }}>Latest month</button>
        <button onClick={() => { onChange(last3()); onClose() }}>Last 3 months</button>
      </div>
      <div className="pop-main">
        <div className="pop-grid">
          {months.map(m => (
            <button key={m}
              className={'mcell' + (inRange(m) ? ' in' : '') + (m === value.from || m === value.to ? ' end' : '')}
              onClick={e => pick(m, e.shiftKey)}>
              {monthName(m)}
            </button>
          ))}
        </div>
        <div className="pop-hint">
          Click a month. <b>Shift-click</b> a second to make it a range.
          {!isSingleMonth(value) && !isWholeWindow(ds, value) && <> Currently {periodLabel(ds, value)}.</>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Venue: searchable, multi-select, with revenue centres nested underneath.
//
// Revenue centres are only offered when a single venue is selected, because a
// centre belongs to a venue and "Sports Bar" means five different rooms across
// the group. They are also only meaningful on pages that read the monthly cube;
// the bar says so rather than silently ignoring the selection.
// ---------------------------------------------------------------------------
const VenuePicker: React.FC<{
  ds: Dataset; scope: Scope; rcEnabled: boolean; rcReason: string
  onChange: (s: Partial<Scope>) => void; onClose: () => void
}> = ({ ds, scope, rcEnabled, rcReason, onChange, onClose }) => {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(scope.venues.length === 1 ? scope.venues[0] : null)
  const needle = q.trim().toLowerCase()

  const shown = useMemo(() => ds.venues
    .map(v => ({ v, rcs: (ds.rcs[v] || []) }))
    .filter(x => !needle || x.v.toLowerCase().includes(needle) || x.rcs.some(r => r.toLowerCase().includes(needle))),
    [ds, needle])

  const toggleVenue = (v: string) => {
    const has = scope.venues.includes(v)
    const next = has ? scope.venues.filter(x => x !== v) : [...scope.venues, v]
    // Revenue centres belong to one venue; changing the venue set drops them.
    onChange({ venues: next, rcs: next.length === 1 && next[0] === v ? scope.rcs : [] })
  }
  const toggleRc = (v: string, rc: string) => {
    const only = scope.venues.length === 1 && scope.venues[0] === v
    const cur = only ? scope.rcs : []
    const next = cur.includes(rc) ? cur.filter(x => x !== rc) : [...cur, rc]
    onChange({ venues: [v], rcs: next })
  }

  return (
    <div className="pop venue-pop">
      <div className="pop-search">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search venues and revenue centres" />
      </div>
      <div className="pop-list">
        <button className={'vrow all' + (isWholeGroup(ds, scope) ? ' on' : '')}
          onClick={() => { onChange({ venues: [], rcs: [] }); onClose() }}>
          <i className="tick" />
          <span className="vname">All venues</span>
          <span className="vmeta">{ds.venues.length} venues · {ds.meta.revenueCentres} centres</span>
        </button>

        {shown.map(({ v, rcs }) => {
          const on = scope.venues.includes(v)
          const soloed = scope.venues.length === 1 && scope.venues[0] === v
          const expanded = open === v
          return (
            <div key={v} className={'vgroup' + (on ? ' on' : '')}>
              <div className="vrow">
                <button className="vhit" onClick={() => toggleVenue(v)}>
                  <i className={'tick' + (on ? ' on' : '')} />
                  <span className="tag">{venueCode(ds, v)}</span>
                  <span className="vname">{v}</span>
                  <span className="vmeta">{rcs.length} centre{rcs.length === 1 ? '' : 's'}</span>
                </button>
                <button className={'vexp' + (expanded ? ' on' : '')} title={rcEnabled ? 'Revenue centres' : rcReason}
                  onClick={() => setOpen(expanded ? null : v)}>▾</button>
              </div>
              {expanded && (
                <div className="rclist">
                  {!rcEnabled && <div className="rcnote">{rcReason}</div>}
                  {rcs.map(rc => (
                    <button key={rc} className={'rcrow' + (soloed && scope.rcs.includes(rc) ? ' on' : '')}
                      disabled={!rcEnabled}
                      onClick={() => toggleRc(v, rc)}>
                      <i className={'tick' + (soloed && scope.rcs.includes(rc) ? ' on' : '')} />
                      <span className="vname">{rc}</span>
                    </button>
                  ))}
                  {soloed && scope.rcs.length > 0 && (
                    <button className="rcclear" onClick={() => onChange({ rcs: [] })}>Whole venue</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="pop-foot">
        <span>{isWholeGroup(ds, scope) ? 'the whole group' : `${scope.venues.length} of ${ds.venues.length} selected`}</span>
        <div style={{ flex: 1 }} />
        {!isWholeGroup(ds, scope) && <button onClick={() => onChange({ venues: [], rcs: [] })}>Clear</button>}
        <button className="primary" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
export const FilterBar: React.FC<{
  ds: Dataset; scope: Scope; onChange: (s: Scope) => void
  rcEnabled: boolean; rcReason: string
  note?: React.ReactNode
}> = ({ ds, scope, onChange, rcEnabled, rcReason, note }) => {
  const [open, setOpen] = useState<'period' | 'venue' | null>(null)
  const ref = useOutside(() => setOpen(null))
  const vs = venuesOf(ds, scope)

  return (
    <div className="filterbar" ref={ref}>
      <div className="fb-row">
        <div className="fb-ctl">
          <label>Period</label>
          <button className={'fb-btn' + (open === 'period' ? ' open' : '')} onClick={() => setOpen(open === 'period' ? null : 'period')}>
            <span>{periodLabel(ds, scope.period)}</span><i>▾</i>
          </button>
          {open === 'period' && (
            <PeriodPicker ds={ds} value={scope.period}
              onChange={p => onChange({ ...scope, period: p })} onClose={() => setOpen(null)} />
          )}
        </div>

        <div className="fb-ctl">
          <label>Venues</label>
          <button className={'fb-btn' + (open === 'venue' ? ' open' : '')} onClick={() => setOpen(open === 'venue' ? null : 'venue')}>
            <span>{venueLabel(ds, scope)}</span><i>▾</i>
          </button>
          {open === 'venue' && (
            <VenuePicker ds={ds} scope={scope} rcEnabled={rcEnabled} rcReason={rcReason}
              onChange={patch => onChange({ ...scope, ...patch })} onClose={() => setOpen(null)} />
          )}
        </div>

        {!isWholeGroup(ds, scope) && vs.length > 1 && (
          <div className="fb-pills">
            {vs.slice(0, 6).map(v => (
              <button key={v} className="fb-pill" title={'Remove ' + v}
                onClick={() => onChange({ ...scope, venues: scope.venues.filter(x => x !== v), rcs: [] })}>
                {venueCode(ds, v)}<i>×</i>
              </button>
            ))}
            {vs.length > 6 && <span className="fb-more">+{vs.length - 6}</span>}
          </div>
        )}
      </div>

      <div className="fb-scope">
        <b>Looking at</b> {scopeSentence(ds, scope)}
        {note && <span className="fb-note">{note}</span>}
      </div>
    </div>
  )
}
