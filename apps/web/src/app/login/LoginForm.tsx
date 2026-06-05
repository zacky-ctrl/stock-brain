'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'
import { fieldWrap, inputStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'

type Mode = 'signin' | 'signup'
type Status = 'idle' | 'loading' | 'error' | 'created'

const linkBtn: React.CSSProperties = {
  color: 'var(--accent-bright)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 'inherit',
  padding: 0,
}

const inputFull: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
  minHeight: '48px',
  fontSize: 'var(--text-base)',
}

const submitBtn: React.CSSProperties = {
  ...btnPrimary,
  width: '100%',
  minHeight: '48px',
  fontSize: 'var(--text-base)',
  fontWeight: 600,
  marginTop: 0,
}

const h1Style: React.CSSProperties = {
  fontSize: 'var(--text-lg)',
  fontWeight: 700,
  marginBottom: '0.25rem',
  color: 'var(--text-primary)',
}

const subtitleStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-sm)',
  marginBottom: '1.5rem',
}

const switchLine: React.CSSProperties = {
  marginTop: '1.25rem',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  textAlign: 'center',
}

export function LoginForm() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const supabase = createSupabaseBrowserClient()

  function switchMode(next: Mode) {
    setMode(next)
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setStatus('idle')
    setErrorMsg('')
  }

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    } else {
      router.push('/')
    }
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      setStatus('error')
      return
    }
    setStatus('loading')
    setErrorMsg('')

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    } else {
      setStatus('created')
    }
  }

  // Post-signup waiting screen
  if (status === 'created') {
    return (
      <>
        <h1 style={h1Style}>Account created</h1>
        <div style={{ ...msgOk, padding: '1rem', marginTop: '1rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Waiting for approval</div>
          <div style={{ fontSize: 'var(--text-sm)' }}>
            Account created. Waiting for admin approval before you can access the system.
          </div>
        </div>
        <p style={switchLine}>
          <button type="button" onClick={() => switchMode('signin')} style={linkBtn}>
            Back to sign in
          </button>
        </p>
      </>
    )
  }

  if (mode === 'signin') {
    return (
      <>
        <h1 style={h1Style}>Sign in</h1>
        <p style={subtitleStyle}>Enter your credentials to access Stock Brain.</p>

        <form onSubmit={handleSignIn}>
          {status === 'error' && (
            <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {errorMsg}</p>
          )}

          <div style={{ ...fieldWrap, marginBottom: '1rem' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              style={inputFull}
            />
          </div>

          <div style={{ ...fieldWrap, marginBottom: '1.25rem' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={inputFull}
            />
          </div>

          <button type="submit" disabled={status === 'loading'} style={submitBtn}>
            {status === 'loading' ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={switchLine}>
          Don&apos;t have an account?{' '}
          <button type="button" onClick={() => switchMode('signup')} style={linkBtn}>
            Sign up
          </button>
        </p>
      </>
    )
  }

  // signup mode
  return (
    <>
      <h1 style={h1Style}>Create account</h1>
      <p style={subtitleStyle}>Sign up to request access to Stock Brain.</p>

      <form onSubmit={handleSignUp}>
        {status === 'error' && (
          <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {errorMsg}</p>
        )}

        <div style={{ ...fieldWrap, marginBottom: '1rem' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            style={inputFull}
          />
        </div>

        <div style={{ ...fieldWrap, marginBottom: '1rem' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
            style={inputFull}
          />
        </div>

        <div style={{ ...fieldWrap, marginBottom: '1.25rem' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Confirm password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
            style={inputFull}
          />
        </div>

        <button type="submit" disabled={status === 'loading'} style={submitBtn}>
          {status === 'loading' ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      <p style={switchLine}>
        Already have an account?{' '}
        <button type="button" onClick={() => switchMode('signin')} style={linkBtn}>
          Sign in
        </button>
      </p>
    </>
  )
}
