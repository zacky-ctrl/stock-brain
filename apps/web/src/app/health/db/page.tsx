import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

type QueryResult =
  | { ok: true; count: number }
  | { ok: false; error: string }

async function queryTable(
  table: string,
  client: ReturnType<typeof createServerSupabaseClient>
): Promise<QueryResult> {
  const { count, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: true })

  if (error) return { ok: false, error: error.message }
  return { ok: true, count: count ?? 0 }
}

export default async function DbHealthPage() {
  let connectionError: string | null = null
  let client: ReturnType<typeof createServerSupabaseClient> | null = null

  try {
    client = createServerSupabaseClient()
  } catch (err) {
    connectionError = err instanceof Error ? err.message : String(err)
  }

  const [shapeDesigns, readyStock] = client
    ? await Promise.all([
        queryTable('shape_designs', client),
        queryTable('ready_stock_balance', client),
      ])
    : [null, null]

  const allOk =
    !connectionError &&
    shapeDesigns?.ok === true &&
    readyStock?.ok === true

  return (
    <main style={{ padding: '2rem', maxWidth: '640px' }}>
      <PageHeader
        title="Database Health"
        badge={<Badge variant={allOk ? 'success' : 'danger'} label={allOk ? 'DB OK' : 'DB check failed'} />}
      />

      <Card style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: '0 0 0.5rem', color: 'var(--text-secondary)' }}>Connection</h2>
        {connectionError ? (
          <p style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>✗ {connectionError}</p>
        ) : (
          <p style={{ margin: 0, color: 'var(--success)', fontSize: 'var(--text-sm)' }}>✓ Supabase client initialised</p>
        )}
      </Card>

      {!connectionError && (
        <Card>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: '0 0 0.75rem', color: 'var(--text-secondary)' }}>Tables</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.25rem 0.75rem 0.25rem 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Table</th>
                <th style={{ padding: '0.25rem 0.75rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rows</th>
                <th style={{ padding: '0.25rem 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              <TableRow
                name="shape_designs"
                result={shapeDesigns}
                note="should be 8 after migrations + seed"
              />
              <TableRow
                name="ready_stock_balance"
                result={readyStock}
                note="0 until goods are received"
              />
            </tbody>
          </table>
        </Card>
      )}

      <p style={{ marginTop: '2rem', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
        This page is a development healthcheck only. It will be removed in
        production builds.
      </p>
    </main>
  )
}

function TableRow({
  name,
  result,
  note,
}: {
  name: string
  result: QueryResult | null
  note: string
}) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <td style={{ padding: '0.4rem 0.75rem 0.4rem 0', fontSize: 'var(--text-sm)' }}>{name}</td>
      <td style={{ padding: '0.4rem 0.75rem', fontSize: 'var(--text-sm)' }}>
        {result?.ok === true ? result.count : '—'}
      </td>
      <td style={{ padding: '0.4rem 0', fontSize: 'var(--text-sm)', color: result?.ok ? 'var(--success)' : 'var(--danger)' }}>
        {result?.ok === true
          ? `✓ ${note}`
          : result?.ok === false
            ? `✗ ${result.error}`
            : '—'}
      </td>
    </tr>
  )
}
