import { createServerSupabaseClient } from '@/lib/supabase/server'
import { tableTh, tableTd } from '@/lib/ui'
import { EditRateForm } from './EditRateForm'
import { AddRateForm } from './AddRateForm'
import { MatrixRateForm } from './MatrixRateForm'
import { PageHeader } from '@/components/ui/PageHeader'
import type { CSSProperties } from 'react'

type RateRow = {
  id: string
  shape_design_id: string
  size_id: string
  gross_per_metre: string | number
  metres_per_bundle: string | number
  buffer_gross: string | number | null
  is_active: boolean
  notes: string | null
  shape_designs: { code: string; name: string | null } | null
  sizes: { code: string } | null
}

function resolveRef<T>(raw: T | T[] | null): T | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

function fmt3(n: number) { return n % 1 === 0 ? String(n) : n.toFixed(3) }

export default async function VelvetRatesPage() {
  const supabase = createServerSupabaseClient()

  const [
    { data, error },
    { data: shapesRaw },
    { data: sizesRaw },
  ] = await Promise.all([
    supabase
      .from('velvet_conversion_rates')
      .select(`
        id, shape_design_id, size_id, gross_per_metre, metres_per_bundle, buffer_gross, is_active, notes,
        shape_designs(code, name),
        sizes(code)
      `)
      .order('is_active', { ascending: false }),
    supabase.from('shape_designs').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('sizes').select('id, code, sort_order').eq('is_active', true).order('sort_order'),
  ])

  const rates = (data ?? []) as unknown as RateRow[]
  const shapes = (shapesRaw ?? []).map((s) => ({
    id: s.id as string,
    label: ((s as { name?: string | null }).name ?? s.code) as string,
    name: ((s as { name?: string | null }).name ?? s.code) as string,
  }))
  const sizes = (sizesRaw ?? []).map((s) => ({
    id: s.id as string,
    code: s.code as string,
  }))

  const existingRates = rates
    .filter((r) => r.is_active)
    .map((r) => ({
      shape_design_id:   r.shape_design_id,
      size_id:           r.size_id,
      gross_per_metre:   Number(r.gross_per_metre),
      metres_per_bundle: Number(r.metres_per_bundle),
      buffer_gross:      Number(r.buffer_gross ?? 10),
    }))

  const tdBool: CSSProperties = { ...tableTd, textAlign: 'center' }
  const thRight: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }
  const tdRight: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1.5rem', fontVariantNumeric: 'tabular-nums' }

  return (
    <>
      <PageHeader
        title="Velvet Conversion Rates"
        subtitle="Gross yield per velvet metre for each (Shape, Size) pair. Metres per bundle used for bundle-to-metre conversion."
      />

      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Error: {error.message}</p>}
      {rates.filter(r => r.is_active).length === 0 && !error && (
        <div style={{ background: 'var(--warning-subtle)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: '600px' }}>
          <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: 'var(--warning)' }}>No active conversion rates defined.</p>
          <p style={{ margin: 0 }}>Velvet is not being automatically deducted from cutting sessions. Add rates below to enable tracking.</p>
        </div>
      )}

      <MatrixRateForm
        shapes={shapes.map((s) => ({ id: s.id, name: s.name }))}
        sizes={sizes}
        existingRates={existingRates}
      />

      <AddRateForm shapes={shapes} sizes={sizes} />

      {rates.length > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1.5rem' }}>
          <thead>
            <tr>
              <th style={tableTh}>Shape</th>
              <th style={tableTh}>Size</th>
              <th style={thRight}>Gross / Metre</th>
              <th style={thRight}>Metres / Bundle</th>
              <th style={thRight}>Buffer Gross</th>
              <th style={{ ...tableTh, textAlign: 'center' }}>Active</th>
              <th style={tableTh}>Notes</th>
              <th style={tableTh}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => {
              const shape = resolveRef(r.shape_designs)
              const size = resolveRef(r.sizes)
              return (
                <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.45 }}>
                  <td style={tableTd}>
                    {(shape as { code: string; name: string | null } | null)?.name ??
                      (shape as { code: string } | null)?.code ?? '—'}
                  </td>
                  <td style={tableTd}>{(size as { code: string } | null)?.code ?? '—'}</td>
                  <td style={tdRight}>{fmt3(Number(r.gross_per_metre))}</td>
                  <td style={tdRight}>{fmt3(Number(r.metres_per_bundle))}</td>
                  <td style={tdRight}>{fmt3(Number(r.buffer_gross ?? 10))}</td>
                  <td style={tdBool}>{r.is_active ? '✓' : '—'}</td>
                  <td style={{ ...tableTd, color: r.notes ? undefined : 'var(--text-muted)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.notes ?? '—'}
                  </td>
                  <td style={tableTd}>
                    {r.is_active && (
                      <EditRateForm
                        rateId={r.id}
                        currentGross={Number(r.gross_per_metre)}
                        currentMetresPerBundle={Number(r.metres_per_bundle)}
                        currentNotes={r.notes}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
