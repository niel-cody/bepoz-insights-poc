import React from 'react'

export const Card: React.FC<{ title?: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, sub, right, children }) => (
  <div className="card">
    {title && (
      <div className="card-h">
        <div className="card-t">{title}</div>
        <div style={{ flex: 1 }} />
        {right}
      </div>
    )}
    {sub && <div className="card-s">{sub}</div>}
    {children}
  </div>
)

export const Section: React.FC<{ title: string; count?: string; open?: boolean; children: React.ReactNode }> = ({ title, count, open, children }) => (
  <details className="sec" open={open}>
    <summary>
      {title}
      {count && <span className="cnt">{count}</span>}
    </summary>
    <div className="body">{children}</div>
  </details>
)

export const Kpi: React.FC<{ label: string; value: string; detail?: React.ReactNode }> = ({ label, value, detail }) => (
  <div className="kpi">
    <div className="kpi-l">{label}</div>
    <div className="kpi-v num">{value}</div>
    {detail && <div className="kpi-d">{detail}</div>}
  </div>
)

export const Chips: React.FC<{
  label: string; options: { k: string; label: string }[]; value: string | string[];
  onChange: (k: string) => void; ghost?: boolean
}> = ({ label, options, value, onChange, ghost }) => {
  const isOn = (k: string) => (Array.isArray(value) ? value.includes(k) : value === k)
  return (
    <div className="frow">
      <div className="flabel">{label}</div>
      {options.map(o => (
        <button key={o.k} className={'chip' + (ghost ? ' ghost' : '') + (isOn(o.k) ? ' on' : '')} onClick={() => onChange(o.k)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const Seg: React.FC<{ options: { k: string; label: string }[]; value: string; onChange: (k: string) => void }> = ({ options, value, onChange }) => (
  <div className="seg">
    {options.map(o => (
      <button key={o.k} className={value === o.k ? 'on' : ''} onClick={() => onChange(o.k)}>{o.label}</button>
    ))}
  </div>
)

export const Note: React.FC<{ title?: string; children: React.ReactNode }> = ({ title = 'Reading this page', children }) => (
  <div className="note" style={{ marginTop: 16 }}>
    <h4>{title}</h4>
    {children}
  </div>
)

export const Tip: React.FC<{ rows: [string, string][]; head?: string }> = ({ rows, head }) => (
  <div className="tt">
    {head && <div style={{ fontWeight: 620, marginBottom: 5 }}>{head}</div>}
    {rows.map(([k, v]) => (
      <div key={k} className="num"><span className="k">{k}</span>&nbsp;&nbsp;{v}</div>
    ))}
  </div>
)
