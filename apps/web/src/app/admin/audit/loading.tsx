export default function AuditLoading() {
  return (
    <main style={{ padding: '1.5rem 2rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: 100, height: 28, marginBottom: '0.4rem' }} />
        <div className="skeleton" style={{ width: 240, height: 13 }} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[160, 130, 100].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: w, height: 34, borderRadius: 8 }} />
        ))}
      </div>

      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '0.9fr 0.7fr 0.9fr 1.5fr 0.7fr',
            gap: '1rem',
            padding: '0.8rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div className="skeleton" style={{ height: 13, width: '70%' }} />
            <div className="skeleton" style={{ height: 13, width: '60%' }} />
            <div className="skeleton" style={{ height: 13, width: '75%' }} />
            <div className="skeleton" style={{ height: 13, width: '80%' }} />
            <div className="skeleton" style={{ height: 20, width: 60, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </main>
  )
}
