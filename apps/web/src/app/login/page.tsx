import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign In — Stock Brain' }

export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: '1.5rem',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            fontSize: '2rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, var(--accent-bright), var(--success))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.35rem',
          }}>
            Stock Brain
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: 0 }}>
            Production &amp; Dispatch Management
          </p>
        </div>

        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '2rem',
        }}>
          <h1 style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 700,
            marginBottom: '0.25rem',
            color: 'var(--text-primary)',
          }}>
            Sign in
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: '1.5rem' }}>
            Enter your email to receive a magic link.
          </p>
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
