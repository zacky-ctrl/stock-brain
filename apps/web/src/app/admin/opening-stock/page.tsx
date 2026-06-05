import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CuttingsEntryForm } from './CuttingsEntryForm'
import { ReadyStockEntryForm } from './ReadyStockEntryForm'
import { VelvetEntryForm } from './VelvetEntryForm'
import { PurchasedStockEntryForm } from './PurchasedStockEntryForm'
import { PageHeader } from '@/components/ui/PageHeader'
import Link from 'next/link'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'

export default async function OpeningStockPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab = 'cuttings' } = await searchParams
  const supabase = createServerSupabaseClient()

  const [
    shapesResult,
    bindiResult,
    sizesResult,
    dabbiResult,
    brandsResult,
    velvetResult,
  ] = await Promise.all([
    supabase.from('shape_designs').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('dabbi_colours').select('id, code').eq('is_active', true).order('code'),
    supabase.from('brands').select('id, code, name').eq('is_active', true).order('code'),
    supabase.from('velvet_stock_balance').select('bundles_on_hand').eq('velvet_type', 'standard').single(),
  ])

  const sizeMaster: SizeMasterRow[] = (sizesResult.data ?? []).map((s) => ({
    id: s.id as string,
    code: s.code as string,
    name: (s.name ?? s.code) as string,
    sort_order: Number(s.sort_order ?? 0),
  }))
  const designMaster: DesignMasterRow[] = (shapesResult.data ?? []).map((s) => ({
    id: s.id as string,
    name: (s.name ?? s.code) as string,
    sort_order: Number(s.sort_order ?? 0),
  }))
  const colourMaster: ColourMasterRow[] = (bindiResult.data ?? []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    name: (c.name ?? c.code) as string,
    sort_order: Number((c as { sort_order?: number }).sort_order ?? 0),
  }))

  const dabbiOptions = (dabbiResult.data ?? []).map((d) => ({ id: d.id as string, label: d.code as string }))
  const brandOptions = (brandsResult.data ?? []).map((b) => ({ id: b.id as string, label: (b.name ?? b.code) as string }))
  const currentBundles = velvetResult.data ? Number(velvetResult.data.bundles_on_hand) : 0

  const tabs = [
    { key: 'cuttings',   label: 'Cuttings Stock' },
    { key: 'purchased',  label: 'Purchased Stock' },
    { key: 'ready',      label: 'Ready Stock' },
    { key: 'velvet',     label: 'Velvet' },
  ]

  const tabLink = (key: string) => `?tab=${key}`

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <PageHeader
        title="Opening Stock / Physical Count Entry"
        subtitle="Enter physical stock to set opening balances or reconcile after a physical count. Every entry creates a stock_correction audit record with reason = OPENING_BALANCE. If a balance row does not exist for a SKU, it is created."
        actions={
          <Link href="/admin/stock-correction" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            Stock Correction →
          </Link>
        }
      />

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {tabs.map((t) => (
          <a
            key={t.key}
            href={tabLink(t.key)}
            style={{
              fontSize: '0.88rem',
              padding: '0.4rem 1rem',
              textDecoration: 'none',
              color: tab === t.key ? 'white' : 'var(--text-secondary)',
              background: tab === t.key ? 'var(--accent)' : 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '3px',
            }}
          >
            {t.label}
          </a>
        ))}
      </div>

      {tab === 'cuttings' && (
        <CuttingsEntryForm
          sizeMaster={sizeMaster}
          designMaster={designMaster}
          colourMaster={colourMaster}
        />
      )}

      {tab === 'purchased' && (
        <PurchasedStockEntryForm
          sizeMaster={sizeMaster}
          designMaster={designMaster}
          colourMaster={colourMaster}
        />
      )}

      {tab === 'ready' && (
        <ReadyStockEntryForm
          sizeMaster={sizeMaster}
          designMaster={designMaster}
          colourMaster={colourMaster}
          dabbiOptions={dabbiOptions}
          brandOptions={brandOptions}
        />
      )}

      {tab === 'velvet' && (
        <VelvetEntryForm currentBundles={currentBundles} />
      )}
    </main>
  )
}
