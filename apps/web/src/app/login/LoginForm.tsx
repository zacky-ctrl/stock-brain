'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'
import { fieldWrap, inputStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const supabase = createSupabaseBrowserClient()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    setErrorMsg('')

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  if (status === 'sent') {
    return (
      <div style={{ ...msgOk, padding: '1rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Check your email</div>
        <div style={{ fontSize: 'var(--text-sm)' }}>
          We sent a magic link to <strong>{email}</strong>. Click it to sign in.
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
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
          style={{
            ...inputStyle,
            width: '100%',
            minHeight: '48px',
            fontSize: 'var(--text-base)',
          }}
        />
      </div>

      <button
        type="submit"
        disabled={status === 'loading'}
        style={{
          ...btnPrimary,
          width: '100%',
          minHeight: '48px',
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          marginTop: 0,
        }}
      >
        {status === 'loading' ? 'Sending…' : 'Send Magic Link'}
      </button>
    </form>
  )
}
