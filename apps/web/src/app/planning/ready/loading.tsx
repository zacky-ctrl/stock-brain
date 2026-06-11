export default function ReadyStockLoading() {
  return (
    <main style={{ padding: '1.5rem 2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: 120, height: 28 }} />
        <div className="skeleton" style={{ width: 100, height: 32, borderRadius: 8 }} />
      </div>

      {/* Stat summary */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem 1.25rem',
            flex: '1 1 130px',
          }}>
            <div className="skeleton" style={{ height: 26, width: '55%', marginBottom: '0.4rem' }} />
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
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 0.7fr 0.6fr 0.6fr 0.6fr 0.7fr 0.7fr 0.5fr',
            gap: '1rem',
            padding: '0.85rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div className="skeleton" style={{ height: 13, width: '70%' }} />
            <div className="skeleton" style={{ height: 13, width: '60%' }} />
            <div className="skeleton" style={{ height: 13, width: '55%' }} />
            <div className="skeleton" style={{ height: 13, width: '55%' }} />
            <div className="skeleton" style={{ height: 13, width: '55%' }} />
            <div className="skeleton" style={{ height: 13, width: '65%' }} />
            <div className="skeleton" style={{ height: 13, width: '60%' }} />
            <div className="skeleton" style={{ height: 28, width: 50, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </main>
  )
}
