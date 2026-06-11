export default function PlanningAllocationLoading() {
  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: 90, height: 28, marginBottom: '0.5rem' }} />
        <div className="skeleton" style={{ width: 380, height: 14 }} />
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem 1.5rem',
            flex: '1 1 160px',
            minWidth: 140,
          }}>
            <div className="skeleton" style={{ height: 32, width: '60%', marginBottom: '0.5rem' }} />
            <div className="skeleton" style={{ height: 11, width: '80%', marginBottom: '0.3rem' }} />
            <div className="skeleton" style={{ height: 10, width: '50%' }} />
          </div>
        ))}
      </div>

      {/* Filter / toggle bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[80, 100, 120, 80].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: w, height: 32 }} />
        ))}
      </div>

      {/* Section label */}
      <div className="skeleton" style={{ width: 160, height: 13, marginBottom: '0.75rem' }} />

      {/* Big planning table skeleton */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        marginBottom: '1.5rem',
      }}>
        {/* Table header */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          padding: '0.7rem 1rem',
          borderBottom: '1px solid var(--border)',
        }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 12, flex: '1 1 60px' }} />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: '1rem',
            padding: '0.85rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
            alignItems: 'center',
          }}>
            <div className="skeleton" style={{ height: 20, flex: '0 0 50px', borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 14, flex: '0 0 100px' }} />
            <div className="skeleton" style={{ height: 14, flex: '0 0 70px' }} />
            <div className="skeleton" style={{ height: 14, flex: '0 0 90px' }} />
            <div className="skeleton" style={{ height: 14, flex: '0 0 60px' }} />
            <div className="skeleton" style={{ height: 14, flex: '0 0 50px' }} />
            <div className="skeleton" style={{ height: 14, flex: '0 0 50px' }} />
            <div className="skeleton" style={{ height: 14, flex: '0 0 60px' }} />
            <div className="skeleton" style={{ height: 14, flex: '0 0 60px' }} />
            <div className="skeleton" style={{ height: 24, flex: '0 0 110px', borderRadius: 6 }} />
          </div>
        ))}
      </div>

      {/* Mobile view skeleton - stacked cards */}
      <div className="mobile-card-list">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.9rem',
            marginBottom: '0.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <div className="skeleton" style={{ height: 15, width: '45%' }} />
              <div className="skeleton" style={{ height: 20, width: 80, borderRadius: 6 }} />
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
