export default function InvoicesLoading() {
  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: 90, height: 28, marginBottom: '0.4rem' }} />
        <div className="skeleton" style={{ width: 320, height: 13 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        <div className="skeleton" style={{ width: 90, height: 32, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: 90, height: 32, borderRadius: 8 }} />
      </div>

      {/* Desktop invoice table */}
      <div className="desktop-table-card" style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '0.8fr 1.2fr 0.7fr 0.6fr 0.7fr 0.6fr 0.8fr 0.8fr 0.9fr 0.6fr 0.5fr',
          gap: '0.75rem',
          padding: '0.7rem 1rem',
          borderBottom: '1px solid var(--border)',
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
            <div key={i} className="skeleton" style={{ height: 11, width: '70%' }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '0.8fr 1.2fr 0.7fr 0.6fr 0.7fr 0.6fr 0.8fr 0.8fr 0.9fr 0.6fr 0.5fr',
            gap: '0.75rem',
            padding: '0.85rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
            alignItems: 'center',
          }}>
            <div className="skeleton" style={{ height: 13, width: '80%', borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 13, width: '70%' }} />
            <div className="skeleton" style={{ height: 13, width: '60%' }} />
            <div className="skeleton" style={{ height: 13, width: '55%' }} />
            <div className="skeleton" style={{ height: 13, width: '60%' }} />
            <div className="skeleton" style={{ height: 20, width: 55, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 13, width: '75%' }} />
            <div className="skeleton" style={{ height: 13, width: '65%' }} />
            <div className="skeleton" style={{ height: 13, width: '70%' }} />
            <div className="skeleton" style={{ height: 20, width: 50, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 28, width: 50, borderRadius: 6 }} />
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="mobile-card-list" style={{ marginTop: '1rem' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.9rem',
            marginBottom: '0.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <div className="skeleton" style={{ height: 15, width: 120, marginBottom: '0.3rem' }} />
                <div className="skeleton" style={{ height: 11, width: 90 }} />
              </div>
              <div className="skeleton" style={{ height: 22, width: 55, borderRadius: 6 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
              {[1, 2, 3, 4, 5].map((j) => (
                <div key={j} className="skeleton" style={{ height: 11 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
