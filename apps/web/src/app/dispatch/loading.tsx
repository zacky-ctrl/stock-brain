export default function DispatchLoading() {
  return (
    <main style={{ padding: '1.5rem 2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: 90, height: 28 }} />
        <div className="skeleton" style={{ width: 130, height: 34, borderRadius: 8 }} />
      </div>

      {/* Section label */}
      <div className="skeleton" style={{ width: 140, height: 12, marginBottom: '0.75rem' }} />

      {/* Desktop table */}
      <div className="desktop-table-card" style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        marginBottom: '2rem',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 0.8fr 0.8fr 0.7fr 0.5fr 0.7fr',
          gap: '1rem',
          padding: '0.7rem 1rem',
          borderBottom: '1px solid var(--border)',
        }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton" style={{ height: 12, width: '65%' }} />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 0.8fr 0.8fr 0.7fr 0.5fr 0.7fr',
            gap: '1rem',
            padding: '0.85rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div className="skeleton" style={{ height: 14, width: '70%' }} />
            <div className="skeleton" style={{ height: 14, width: '55%' }} />
            <div className="skeleton" style={{ height: 14, width: '50%' }} />
            <div className="skeleton" style={{ height: 14, width: '45%' }} />
            <div className="skeleton" style={{ height: 14, width: '40%' }} />
            <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 6 }} />
          </div>
        ))}
      </div>

      {/* Section label 2 */}
      <div className="skeleton" style={{ width: 130, height: 12, marginBottom: '0.75rem' }} />

      {/* History table */}
      <div className="desktop-table-card" style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '0.6fr 0.8fr 1.2fr 0.8fr 0.6fr 0.5fr 0.5fr',
            gap: '1rem',
            padding: '0.85rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div className="skeleton" style={{ height: 14, width: '80%' }} />
            <div className="skeleton" style={{ height: 14, width: '60%' }} />
            <div className="skeleton" style={{ height: 14, width: '75%' }} />
            <div className="skeleton" style={{ height: 14, width: '50%' }} />
            <div className="skeleton" style={{ height: 20, width: 65, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 14, width: '60%' }} />
            <div className="skeleton" style={{ height: 14, width: '70%' }} />
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="mobile-card-list">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.9rem',
            marginBottom: '0.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div className="skeleton" style={{ height: 16, width: '50%' }} />
              <div className="skeleton" style={{ height: 20, width: 65, borderRadius: 6 }} />
            </div>
            <div className="skeleton" style={{ height: 12, width: '35%', marginBottom: '0.75rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              {[1, 2, 3].map((j) => (
                <div key={j} className="skeleton" style={{ height: 12 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
