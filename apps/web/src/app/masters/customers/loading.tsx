export default function CustomersLoading() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: 100, height: 28 }} />
        <div className="skeleton" style={{ width: 120, height: 34, borderRadius: 8 }} />
      </div>

      {/* Customer cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
          }}>
            <div className="skeleton" style={{ height: 18, width: '65%', marginBottom: '0.6rem' }} />
            <div className="skeleton" style={{ height: 12, width: '80%', marginBottom: '0.4rem' }} />
            <div className="skeleton" style={{ height: 12, width: '55%', marginBottom: '0.4rem' }} />
            <div className="skeleton" style={{ height: 12, width: '45%', marginBottom: '0.9rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div className="skeleton" style={{ height: 30, flex: 1, borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 30, flex: 1, borderRadius: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
