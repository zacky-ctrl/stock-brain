export default function ReceiptsLoading() {
  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: 90, height: 28 }} />
        <div className="skeleton" style={{ width: 130, height: 34, borderRadius: 8 }} />
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
            gridTemplateColumns: '0.8fr 1.2fr 0.7fr 0.9fr 0.6fr 0.6fr 0.5fr',
            gap: '1rem',
            padding: '0.85rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
            alignItems: 'center',
          }}>
            <div className="skeleton" style={{ height: 13, width: '70%' }} />
            <div className="skeleton" style={{ height: 13, width: '75%' }} />
            <div className="skeleton" style={{ height: 13, width: '60%' }} />
            <div className="skeleton" style={{ height: 13, width: '70%' }} />
            <div className="skeleton" style={{ height: 20, width: 65, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 13, width: '65%' }} />
            <div className="skeleton" style={{ height: 28, width: 50, borderRadius: 6 }} />
          </div>
        ))}
      </div>

      <div className="mobile-card-list">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.9rem',
            marginBottom: '0.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
              <div className="skeleton" style={{ height: 15, width: '55%' }} />
              <div className="skeleton" style={{ height: 20, width: 60, borderRadius: 6 }} />
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
