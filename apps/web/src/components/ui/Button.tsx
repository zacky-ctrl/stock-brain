import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: LucideIcon
  children?: ReactNode
}

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    boxShadow: 'var(--shadow-accent)',
  },
  secondary: {
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-strong)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--danger-subtle)',
    color: 'var(--danger)',
    border: '1px solid rgba(255, 71, 87, 0.4)',
  },
}

const SIZE_STYLES: Record<ButtonSize, CSSProperties> = {
  sm: { padding: '0.3rem 0.7rem', fontSize: 'var(--text-xs)', gap: '0.3rem' },
  md: { padding: '0.6rem 1.25rem', fontSize: 'var(--text-sm)', gap: '0.4rem' },
  lg: { padding: '0.7rem 1.5rem', fontSize: 'var(--text-base)', gap: '0.5rem' },
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon: Icon,
  children,
  style,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled ?? loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-sm)',
        fontWeight: 600,
        cursor: disabled ?? loading ? 'not-allowed' : 'pointer',
        opacity: disabled ?? loading ? 0.6 : 1,
        transition: 'background 150ms ease, opacity 150ms ease, transform 150ms ease, box-shadow 150ms ease',
        whiteSpace: 'nowrap',
        ...VARIANT_STYLES[variant],
        ...SIZE_STYLES[size],
        ...style,
      }}
    >
      {loading ? (
        <span className="spinner" style={{ width: '1em', height: '1em', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block' }} />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 13 : size === 'lg' ? 17 : 15} />
      ) : null}
      {children}
    </button>
  )
}
