export default function CuttingRequiredLoading() {
  return (
    <main style={{ padding: '1.5rem 2rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: 160, height: 28, marginBottom: '0.4rem' }} />
        <div className="skeleton" style={{ width: 260, height: 13 }} />
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem 1.25rem',
            flex: '1 1 140px',
          }}>
            <div className="skeleton" style={{ height: 26, width: '50%', marginBottom: '0.4rem' }} />
            <div className="skeleton" style={{ height: 11, width: '70%' }} />
          </div>
        ))}
      </div>

      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.7fr 0.6fr 0.6fr 0.7fr 0.8fr',
            gap: '1rem',
            padding: '0.85rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div className="skeleton" style={{ height: 13, width: '75%' }} />
            <div className="skeleton" style={{ height: 13, width: '60%' }} />
            <div className="skeleton" style={{ height: 13, width: '55%' }} />
            <div className="skeleton" style={{ height: 13, width: '55%' }} />
            <div className="skeleton" style={{ height: 13, width: '65%' }} />
            <div className="skeleton" style={{ height: 13, width: '60%' }} />
          </div>
        ))}
      </div>
    </main>
  )
}
