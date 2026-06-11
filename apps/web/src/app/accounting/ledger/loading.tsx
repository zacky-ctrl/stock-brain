export default function LedgerLoading() {
  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <div className="skeleton" style={{ width: 150, height: 28, marginBottom: '0.4rem' }} />
          <div className="skeleton" style={{ width: 260, height: 13 }} />
        </div>
      </div>

      {/* Customer filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div className="skeleton" style={{ width: 200, height: 36, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: 100, height: 36, borderRadius: 8 }} />
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem 1.25rem',
            flex: '1 1 140px',
          }}>
            <div className="skeleton" style={{ height: 28, width: '55%', marginBottom: '0.4rem' }} />
            <div className="skeleton" style={{ height: 11, width: '75%' }} />
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '0.7fr 1.2fr 0.7fr 0.8fr 0.8fr 0.8fr 0.7fr',
            gap: '1rem',
            padding: '0.85rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div className="skeleton" style={{ height: 13, width: '65%' }} />
            <div className="skeleton" style={{ height: 13, width: '75%' }} />
            <div className="skeleton" style={{ height: 20, width: 55, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 13, width: '70%' }} />
            <div className="skeleton" style={{ height: 13, width: '65%' }} />
            <div className="skeleton" style={{ height: 13, width: '70%' }} />
            <div className="skeleton" style={{ height: 13, width: '60%' }} />
          </div>
        ))}
      </div>

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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
              <div className="skeleton" style={{ height: 15, width: '50%' }} />
              <div className="skeleton" style={{ height: 20, width: 55, borderRadius: 6 }} />
            </div>
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
