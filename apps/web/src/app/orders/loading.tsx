export default function OrdersLoading() {
  return (
    <main style={{ padding: '1.5rem 2rem' }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: 100, height: 28 }} />
        <div className="skeleton" style={{ width: 110, height: 34, borderRadius: 8 }} />
      </div>

      {/* Filter bar skeleton */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[120, 140, 100, 80].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: w, height: 34 }} />
        ))}
      </div>

      {/* Desktop table skeleton */}
      <div className="desktop-table-card" style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.8fr 1fr 0.8fr 0.7fr 0.7fr 0.9fr',
          gap: '1rem',
          padding: '0.7rem 1rem',
          borderBottom: '1px solid var(--border)',
        }}>
          {['Customer', 'Date', 'Status', 'Ordered', 'Open', 'Action'].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 12, width: '70%' }} />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1.8fr 1fr 0.8fr 0.7fr 0.7fr 0.9fr',
            gap: '1rem',
            padding: '0.85rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div className="skeleton" style={{ height: 14, width: `${60 + Math.floor(i * 7) % 30}%` }} />
            <div className="skeleton" style={{ height: 14, width: '60%' }} />
            <div className="skeleton" style={{ height: 20, width: 70, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 14, width: '50%' }} />
            <div className="skeleton" style={{ height: 14, width: '50%' }} />
            <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 6 }} />
          </div>
        ))}
      </div>

      {/* Mobile card list skeleton */}
      <div className="mobile-card-list" style={{ gap: '0.5rem' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.9rem',
            marginBottom: '0.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div className="skeleton" style={{ height: 16, width: '55%' }} />
              <div className="skeleton" style={{ height: 20, width: 60, borderRadius: 6 }} />
            </div>
            <div className="skeleton" style={{ height: 12, width: '40%', marginBottom: '0.75rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="skeleton" style={{ height: 12 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
