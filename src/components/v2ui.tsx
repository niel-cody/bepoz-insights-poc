import React from 'react'
import { Delta, n0, n1, pct } from '../lib'

/**
 * v2's shared vocabulary. The organising principle for every component here:
 * a page opens with a judgement, not a number.
 */

/** One line, in the operator's words, naming the question this page answers. */
export const Standfirst: React.FC<{ question: string; sub?: string }> = ({ question, sub }) => (
  <div className="standfirst">
    <h2>{question}</h2>
    {sub && <p>{sub}</p>}
  </div>
)

/** ▲ 12.3% / ▼ 4.1%, grey inside ±3%. Never colour alone: the arrow carries it. */
export const DeltaTag: React.FC<{ d: Delta; label?: string; abs?: (v: number) => string }> = ({ d, label, abs }) => {
  if (!d.hasBase) return <span className="delta none" title="No prior period to compare against">no baseline</span>
  const arrow = d.pct > 0 ? '▲' : d.pct < 0 ? '▼' : '■'
  const cls = d.dir === 1 ? 'up' : d.dir === -1 ? 'down' : 'flat'
  return (
    <span className={'delta ' + cls} title={abs ? abs(d.abs) : undefined}>
      {arrow} {pct(Math.abs(d.pct), 1)}{label ? ' ' + label : ''}
    </span>
  )
}

/** A KPI that cannot be read without its comparison. */
export const JudgedKpi: React.FC<{
  label: string; value: string; delta?: Delta; deltaLabel?: string
  index?: number; foot?: React.ReactNode; hero?: boolean
}> = ({ label, value, delta, deltaLabel, index, foot, hero }) => (
  <div className={'kpi j' + (hero ? ' hero' : '')}>
    <div className="kpi-l">{label}</div>
    <div className="kpi-v num">{value}</div>
    <div className="kpi-row">
      {delta && <DeltaTag d={delta} label={deltaLabel} />}
      {index != null && isFinite(index) && (
        <span className={'idx ' + (index >= 110 ? 'up' : index <= 90 ? 'down' : 'flat')} title="100 = group average">
          idx {n0(index)}
        </span>
      )}
    </div>
    {foot && <div className="kpi-d">{foot}</div>}
  </div>
)

/** Sorting affordance for a column header. */
export const Sortable: React.FC<{
  id: string; sort: { by: string; dir: 1 | -1 }; onSort: (id: string) => void; children: React.ReactNode; className?: string
}> = ({ id, sort, onSort, children, className }) => (
  <th className={(className || '') + ' sortable' + (sort.by === id ? ' on' : '')} onClick={() => onSort(id)}>
    {children}<span className="carat">{sort.by === id ? (sort.dir === 1 ? '▲' : '▼') : '⇅'}</span>
  </th>
)

/** A bar that reads as a comparison against the group, not a decoration. */
export const IndexBar: React.FC<{ index: number }> = ({ index }) => {
  const clamped = Math.max(0, Math.min(200, index))
  const over = index >= 100
  return (
    <div className="idxbar" title={`${n1(index)} vs group average of 100`}>
      <i className="mid" />
      <i className={'fill ' + (over ? 'up' : 'down')}
        style={over
          ? { left: '50%', width: ((clamped - 100) / 200) * 100 + '%' }
          : { right: '50%', width: ((100 - clamped) / 200) * 100 + '%' }} />
    </div>
  )
}

/** Data-gap disclosure. Never render a confident chart on incomplete data. */
export const Caveat: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="caveat">{children}</div>
)

/** Ranked callout used on the overview: what needs attention, in order. */
export const Attention: React.FC<{
  rank: number; title: string; detail: React.ReactNode; tone: 'up' | 'down' | 'flat'; action?: React.ReactNode
}> = ({ rank, title, detail, tone, action }) => (
  <div className={'attn ' + tone}>
    <div className="attn-rank">{rank}</div>
    <div className="attn-body">
      <div className="attn-title">{title}</div>
      <div className="attn-detail">{detail}</div>
    </div>
    {action && <div className="attn-action">{action}</div>}
  </div>
)
