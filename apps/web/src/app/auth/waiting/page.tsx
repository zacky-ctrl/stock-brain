import { createAuthClient } from '@/lib/supabase/auth-client'
import { SignOutButton } from './SignOutButton'

export const metadata = { title: 'Pending Access — Stock Brain' }

export default async function WaitingPage() {
  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: '1.5rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--warning-subtle)',
          border: '2px solid var(--warning)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.25rem',
          fontSize: '1.5rem',
        }}>
          ⏳
        </div>

        <h1 style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '0.5rem',
        }}>
          Pending approval
        </h1>

        <p style={{
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-sm)',
          marginBottom: '0.5rem',
          lineHeight: 1.6,
        }}>
          Your account is pending approval.
        </p>
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-sm)',
          marginBottom: '1.5rem',
          lineHeight: 1.6,
        }}>
          Please contact your administrator to get access.
        </p>

        {user?.email && (
          <div style={{
            padding: '0.5rem 0.75rem',
            background: 'var(--bg-base)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            marginBottom: '1.5rem',
            fontFamily: 'monospace',
          }}>
            {user.email}
          </div>
        )}

        <SignOutButton />
      </div>
    </div>
  )
}
