import React, { useEffect, useRef, useState } from 'react'

export const IDLE_LIMIT_MS = 30 * 60 * 1000   // lock after 30 minutes of inactivity

/**
 * Password gate. The dataset is encrypted, so this screen is the only way in —
 * a failed attempt fails AES-GCM authentication rather than a string compare.
 */
export const LoginScreen: React.FC<{
  onSubmit: (password: string) => Promise<void>
  wasTimedOut: boolean
}> = ({ onSubmit, wasTimedOut }) => {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(wasTimedOut ? 'Session timed out after 30 minutes of inactivity.' : null)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pw || busy) return
    setBusy(true); setErr(null)
    try {
      await onSubmit(pw)
    } catch (ex: any) {
      setErr(ex?.name === 'WrongPassword' ? 'That password is not correct.' : String(ex?.message || ex))
      setPw('')
      setBusy(false)
      ref.current?.focus()
    }
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-mark">
          <span /><span /><span />
        </div>
        <h1>Feros Group</h1>
        <h2>Strategic Review</h2>
        <p className="gate-sub">
          11 venues · 44 revenue centres · Jan–Jul 2026<br />
          Commercial in confidence
        </p>

        <label className="gate-label" htmlFor="pw">Access password</label>
        <input
          id="pw" ref={ref} type="password" value={pw} autoComplete="current-password"
          spellCheck={false} placeholder="•••••-•••••-•••••-•••••"
          onChange={e => setPw(e.target.value)} disabled={busy}
        />
        <button type="submit" disabled={!pw || busy}>
          {busy ? 'Decrypting…' : 'Unlock'}
        </button>

        {err && <div className="gate-err">{err}</div>}

        <div className="gate-foot">
          The report is encrypted at rest with AES-256-GCM. The password is not stored
          in this page, so nothing here is readable without it.
        </div>
      </form>
    </div>
  )
}

/** Idle countdown shown in the header, with a manual lock. */
export const LockStatus: React.FC<{ idleFor: number; onLock: () => void }> = ({ idleFor, onLock }) => {
  const left = Math.max(0, IDLE_LIMIT_MS - idleFor)
  const mins = Math.ceil(left / 60000)
  const low = left < 5 * 60 * 1000
  return (
    <div className="lockbar">
      <span className={low ? 'low' : ''}>Locks in {mins}m</span>
      <button onClick={onLock}>Lock now</button>
    </div>
  )
}

/** Tracks activity and fires onIdle once the limit is passed. */
export function useIdleLock(active: boolean, onIdle: () => void) {
  const [idleFor, setIdleFor] = useState(0)
  const last = useRef(Date.now())

  useEffect(() => {
    if (!active) return
    last.current = Date.now()
    setIdleFor(0)

    const bump = () => { last.current = Date.now() }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach(e => window.addEventListener(e, bump, { passive: true }))

    const timer = window.setInterval(() => {
      const gap = Date.now() - last.current
      setIdleFor(gap)
      if (gap >= IDLE_LIMIT_MS) onIdle()
    }, 10000)

    return () => {
      events.forEach(e => window.removeEventListener(e, bump))
      window.clearInterval(timer)
    }
  }, [active, onIdle])

  return idleFor
}
