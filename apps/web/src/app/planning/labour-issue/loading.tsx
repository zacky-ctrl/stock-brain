export default function LabourIssueLoading() {
  return (
    <main style={{ padding: '1.5rem 2rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: 120, height: 28, marginBottom: '0.4rem' }} />
        <div className="skeleton" style={{ width: 280, height: 13 }} />
      </div>

      {/* Print button area */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <div className="skeleton" style={{ width: 100, height: 32, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: 130, height: 32, borderRadius: 8 }} />
      </div>

      {/* Section groups */}
      {[1, 2].map((s) => (
        <div key={s} style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div className="skeleton" style={{ width: 16, height: 16, borderRadius: '50%' }} />
            <div className="skeleton" style={{ width: 180, height: 16 }} />
          </div>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 0.7fr 0.6fr 0.5fr 0.5fr 0.7fr 0.6fr',
                gap: '1rem',
                padding: '0.8rem 1rem',
                borderBottom: '1px solid var(--border-subtle)',
              }}>
                <div className="skeleton" style={{ height: 13, width: '75%' }} />
                <div className="skeleton" style={{ height: 13, width: '60%' }} />
                <div className="skeleton" style={{ height: 13, width: '65%' }} />
                <div className="skeleton" style={{ height: 13, width: '55%' }} />
                <div className="skeleton" style={{ height: 13, width: '55%' }} />
                <div className="skeleton" style={{ height: 13, width: '60%' }} />
                <div className="skeleton" style={{ height: 13, width: '50%' }} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Mobile */}
      <div className="mobile-card-list">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.9rem',
            marginBottom: '0.5rem',
          }}>
            <div className="skeleton" style={{ height: 15, width: '60%', marginBottom: '0.65rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="skeleton" style={{ height: 11 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
