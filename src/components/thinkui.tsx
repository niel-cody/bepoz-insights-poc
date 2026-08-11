import React from 'react'

/**
 * The Thinking edition's shared vocabulary.
 *
 * New's organising principle was "a page opens with a judgement, not a number".
 * Thinking's is one step further: a judgement opens with the evidence for it,
 * and the reader can move the evidence and watch the judgement change. Every
 * component here exists to make an estimate and its uncertainty occupy the same
 * space, which is the one design pattern worth stealing from Seeing Theory.
 */

// ---------------------------------------------------------------------------
// Verdicts. Three states, never two. "Not enough data" is a finding.
// ---------------------------------------------------------------------------
export type VerdictKind = 'moved' | 'within' | 'thin' | 'above' | 'below' | 'holiday' | 'normal'

const VERDICT_TEXT: Record<VerdictKind, string> = {
  moved: 'Moved', within: 'Within normal', thin: 'Not enough data',
  above: 'Above normal', below: 'Below normal', holiday: 'Public holiday', normal: 'Normal',
}
const VERDICT_TONE: Record<VerdictKind, string> = {
  moved: 'v-strong', within: 'v-quiet', thin: 'v-thin',
  above: 'v-up', below: 'v-down', holiday: 'v-hol', normal: 'v-quiet',
}

export const Verdict: React.FC<{ kind: VerdictKind; label?: string; title?: string }> = ({ kind, label, title }) => (
  <span className={'verdict ' + VERDICT_TONE[kind]} title={title}>{label ?? VERDICT_TEXT[kind]}</span>
)

// ---------------------------------------------------------------------------
// A control the reader drives. The point of the whole edition is that these
// move and the conclusions move with them.
// ---------------------------------------------------------------------------
export const Dial: React.FC<{
  label: string; value: number; min: number; max: number; step?: number
  display: string; hint?: string; onChange: (v: number) => void
}> = ({ label, value, min, max, step = 1, display, hint, onChange }) => (
  <div className="dial">
    <div className="dial-h">
      <span className="dial-l">{label}</span>
      <span className="dial-v num">{display}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      style={{ ['--fill' as any]: ((value - min) / (max - min)) * 100 + '%' }}
      onChange={e => onChange(+e.target.value)} />
    {hint && <div className="dial-hint">{hint}</div>}
  </div>
)

export const Switcher: React.FC<{
  label?: string; options: { k: string; label: string; title?: string }[]; value: string; onChange: (k: string) => void
}> = ({ label, options, value, onChange }) => (
  <div className="switcher">
    {label && <span className="dial-l">{label}</span>}
    <div className="seg">
      {options.map(o => (
        <button key={o.k} className={value === o.k ? 'on' : ''} title={o.title} onClick={() => onChange(o.k)}>{o.label}</button>
      ))}
    </div>
  </div>
)

/** The strip of controls that sits under every standfirst. */
export const Controls: React.FC<{ children: React.ReactNode; note?: React.ReactNode }> = ({ children, note }) => (
  <div className="controls">
    <div className="controls-row">{children}</div>
    {note && <div className="controls-note">{note}</div>}
  </div>
)

// ---------------------------------------------------------------------------
// The teardown block. What the earlier edition claimed, and what the data will
// actually carry. Used sparingly — once per page, at most.
// ---------------------------------------------------------------------------
export const Ledger: React.FC<{ was: React.ReactNode; is: React.ReactNode; where?: string }> = ({ was, is, where }) => (
  <div className="ledger">
    <div className="ledger-col was">
      <div className="ledger-k">What {where || 'the earlier view'} said</div>
      <div className="ledger-b">{was}</div>
    </div>
    <div className="ledger-arrow">→</div>
    <div className="ledger-col is">
      <div className="ledger-k">What the data supports</div>
      <div className="ledger-b">{is}</div>
    </div>
  </div>
)

// ---------------------------------------------------------------------------
// The estimate plot: a point and the interval around it, on a shared axis with
// zero marked. This single chart replaces most of the percentage columns in the
// other two editions, because it is the only one that shows how much of the
// number you are entitled to believe.
// ---------------------------------------------------------------------------
export interface EstimateRow {
  key: string; label: string; sub?: string
  point: number; lo: number; hi: number
  kind: VerdictKind
  value?: string
  /** Overrides the verdict chip's wording where the default states do not fit. */
  verdictLabel?: string
  /** Shown in place of a bar when there is no interval — say why, or say nothing. */
  noIntervalNote?: string
  onClick?: () => void
}

export const EstimatePlot: React.FC<{
  rows: EstimateRow[]; fmt: (v: number) => string; zeroLabel?: string; height?: number
}> = ({ rows, fmt, zeroLabel = 'no change', height = 34 }) => {
  const finite = rows.flatMap(r => [r.lo, r.hi, r.point]).filter(isFinite)
  const lim = Math.max(1, ...finite.map(Math.abs)) * 1.08
  const x = (v: number) => ((v + lim) / (2 * lim)) * 100
  return (
    <div className="est">
      <div className="est-axis">
        <span style={{ left: 0 }}>{fmt(-lim)}</span>
        <span style={{ left: '50%', transform: 'translateX(-50%)' }} className="est-zero-l">{zeroLabel}</span>
        <span style={{ right: 0 }}>{fmt(lim)}</span>
      </div>
      {rows.map(r => (
        <div key={r.key} className={'est-row' + (r.onClick ? ' click' : '')} onClick={r.onClick} style={{ height }}>
          <div className="est-lab">
            {r.label}
            {r.sub && <span className="est-sub">{r.sub}</span>}
          </div>
          <div className="est-track">
            <i className="est-zero" />
            {isFinite(r.lo) && isFinite(r.hi) && (
              <i className={'est-bar ' + VERDICT_TONE[r.kind]}
                style={{ left: x(Math.min(r.lo, r.hi)) + '%', width: Math.abs(x(r.hi) - x(r.lo)) + '%' }} />
            )}
            {isFinite(r.point) && <i className={'est-dot ' + VERDICT_TONE[r.kind]} style={{ left: x(r.point) + '%' }} />}
            {!isFinite(r.lo) && r.noIntervalNote && <span className="est-none">{r.noIntervalNote}</span>}
          </div>
          <div className="est-val num">{r.value ?? (isFinite(r.point) ? fmt(r.point) : '—')}</div>
          <div className="est-v"><Verdict kind={r.kind} label={r.verdictLabel} /></div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A stated method. Every page that computes something shows what it computed.
// ---------------------------------------------------------------------------
export const Method: React.FC<{ title?: string; formula?: string; children: React.ReactNode }> = ({ title = 'How this was worked out', formula, children }) => (
  <details className="sec method">
    <summary>{title}<span className="cnt">the arithmetic, stated</span></summary>
    <div className="body">
      {formula && <pre className="formula">{formula}</pre>}
      <div className="reasoning">{children}</div>
    </div>
  </details>
)

/** The one-line conclusion a page exists to produce. */
export const Finding: React.FC<{ tone?: 'up' | 'down' | 'flat'; children: React.ReactNode }> = ({ tone = 'flat', children }) => (
  <div className={'finding ' + tone}>{children}</div>
)

/** A number with its interval, inline, so the two are never separated. */
export const WithInterval: React.FC<{ point: string; lo: string; hi: string; conf: number }> = ({ point, lo, hi, conf }) => (
  <span className="wint num">
    <b>{point}</b>
    <span className="wint-i">{lo} to {hi}</span>
    <span className="wint-c">{Math.round(conf * 100)}%</span>
  </span>
)

export const StatGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="statgrid">{children}</div>

export const Stat: React.FC<{ label: string; value: React.ReactNode; foot?: React.ReactNode; tone?: string }> = ({ label, value, foot, tone }) => (
  <div className={'statb' + (tone ? ' ' + tone : '')}>
    <div className="statb-l">{label}</div>
    <div className="statb-v num">{value}</div>
    {foot && <div className="statb-f">{foot}</div>}
  </div>
)
