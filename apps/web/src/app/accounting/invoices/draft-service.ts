import {
  calculateSalesInvoice,
  resolveSalesRateKind,
  type CalculatedSalesInvoiceLine,
  type SalesInvoiceSourceLine,
} from '@stock-brain/domain'
import type { createServerSupabaseClient } from '@/lib/supabase/server'

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

type CustomerRow = {
  id: string
  name: string
  entity_name: string | null
  address: string | null
  phone_number: string | null
  transport_name: string | null
  yellow_rate_per_gross: number | string | null
  white_rate_per_gross: number | string | null
  payment_terms_days: number | string | null
}

type DispatchEventRow = {
  id: string
  customer_id: string
  dispatch_date: string
  challan_number: string | null
  status: string
  customers: CustomerRow | CustomerRow[] | null
}

type MasterRef = {
  id: string
  name?: string | null
  code?: string | null
}

type ReadyStockBalanceRow = {
  id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  shape_design: MasterRef | MasterRef[] | null
  bindi_colour: MasterRef | MasterRef[] | null
  size: MasterRef | MasterRef[] | null
  dabbi_colour: MasterRef | MasterRef[] | null
  brand: MasterRef | MasterRef[] | null
}

type DispatchLineRow = {
  id: string
  order_line_id: string | null
  ready_stock_balance_id: string
  quantity_dispatched: number | string
}

type ExistingInvoiceLink = {
  sales_invoice_id: string
  sales_invoices: { id: string } | { id: string }[] | null
}

type CreatedInvoiceRow = {
  id: string
}

type SalesInvoiceLineInsert = {
  sales_invoice_id: string
  dispatch_line_id: string
  order_line_id: string | null
  ready_stock_balance_id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  shape_name_snapshot: string
  bindi_colour_code_snapshot: string
  size_code_snapshot: string
  dabbi_colour_code_snapshot: string
  brand_name_snapshot: string | null
  line_type: 'dispatch'
  rate_kind: 'yellow' | 'white'
  quantity_gross: number
  rate_per_gross: number
  line_amount: number
}

export type DraftInvoiceCreateInput = {
  dispatchId: string
  actor: string
  invoiceDate?: string
  dueDate?: string | null
  yellowRate?: number | null
  whiteRate?: number | null
  transportCharges?: number
  otherCharges?: number
  discountAmount?: number
  roundOffAmount?: number
  notes?: string | null
}

export type DraftInvoiceCreateResult =
  | { ok: true; invoiceId: string; alreadyExisted: boolean }
  | { ok: false; error: string }

function resolveRef<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

function addDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function lineById(
  lines: CalculatedSalesInvoiceLine[],
  sourceLineId: string,
): CalculatedSalesInvoiceLine | null {
  return lines.find((line) => line.source_line_id === sourceLineId) ?? null
}

function normalisedDabbiCode(ref: MasterRef | null): string | null {
  const raw = `${ref?.code ?? ''} ${ref?.name ?? ''}`.trim().toUpperCase()
  if (!raw) return null
  if (raw.includes('YELLOW')) return 'YELLOW'
  if (raw.includes('WHITE')) return 'WHITE'
  if (resolveSalesRateKind(raw)) return raw
  return null
}

async function fetchReadyStockBalances(
  supabase: SupabaseClient,
  balanceIds: string[],
): Promise<Map<string, ReadyStockBalanceRow>> {
  if (balanceIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('ready_stock_balance')
    .select(`
      id,
      shape_design_id,
      bindi_colour_id,
      size_id,
      dabbi_colour_id,
      brand_id,
      shape_design:shape_design_id (id, name),
      bindi_colour:bindi_colour_id (id, code),
      size:size_id (id, code),
      dabbi_colour:dabbi_colour_id (id, code, name),
      brand:brand_id (id, name)
    `)
    .in('id', balanceIds)

  if (error) throw new Error(error.message)

  const balances = new Map<string, ReadyStockBalanceRow>()
  for (const row of (data ?? []) as unknown as ReadyStockBalanceRow[]) {
    balances.set(row.id, row)
  }
  return balances
}

export async function createDraftInvoiceForDispatch(
  supabase: SupabaseClient,
  input: DraftInvoiceCreateInput,
): Promise<DraftInvoiceCreateResult> {
  const { data: existingRaw, error: existingError } = await supabase
    .from('sales_invoice_dispatches')
    .select('sales_invoice_id, sales_invoices(id)')
    .eq('dispatch_event_id', input.dispatchId)
    .maybeSingle()

  if (existingError) return { ok: false, error: existingError.message }

  const existing = existingRaw as unknown as ExistingInvoiceLink | null
  const existingInvoice = resolveRef(existing?.sales_invoices)
  const existingInvoiceId = existingInvoice?.id ?? existing?.sales_invoice_id ?? null
  if (existingInvoiceId) {
    return { ok: true, invoiceId: existingInvoiceId, alreadyExisted: true }
  }

  const { data: eventRaw, error: eventError } = await supabase
    .from('dispatch_events')
    .select(`
      id,
      customer_id,
      dispatch_date,
      challan_number,
      status,
      customers (
        id,
        name,
        entity_name,
        address,
        phone_number,
        transport_name,
        yellow_rate_per_gross,
        white_rate_per_gross,
        payment_terms_days
      )
    `)
    .eq('id', input.dispatchId)
    .single()

  if (eventError || !eventRaw) return { ok: false, error: eventError?.message ?? 'Dispatch not found' }

  const event = eventRaw as unknown as DispatchEventRow
  if (event.status !== 'confirmed') return { ok: false, error: 'Only confirmed dispatches can be invoiced' }

  const customer = resolveRef(event.customers)
  if (!customer) return { ok: false, error: 'Customer not found for this dispatch' }

  const yellowRate = input.yellowRate ?? numberOrNull(customer.yellow_rate_per_gross) ?? 0
  const whiteRate = input.whiteRate ?? numberOrNull(customer.white_rate_per_gross) ?? 0
  const termsDays = numberOrNull(customer.payment_terms_days) ?? 0

  if (yellowRate < 0) return { ok: false, error: 'Yellow rate is invalid' }
  if (whiteRate < 0) return { ok: false, error: 'White rate is invalid' }

  const { data: dispatchLinesRaw, error: linesError } = await supabase
    .from('dispatch_lines')
    .select(`
      id,
      order_line_id,
      ready_stock_balance_id,
      quantity_dispatched
    `)
    .eq('dispatch_event_id', input.dispatchId)
    .order('created_at')

  if (linesError) return { ok: false, error: linesError.message }

  const dispatchLines = (dispatchLinesRaw ?? []) as unknown as DispatchLineRow[]
  if (dispatchLines.length === 0) return { ok: false, error: 'Dispatch has no lines to invoice' }

  let balancesById: Map<string, ReadyStockBalanceRow>
  try {
    balancesById = await fetchReadyStockBalances(
      supabase,
      [...new Set(dispatchLines.map((line) => line.ready_stock_balance_id))],
    )
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not read ready stock master data' }
  }

  const sourceLines: SalesInvoiceSourceLine[] = []
  for (const line of dispatchLines) {
    const balance = balancesById.get(line.ready_stock_balance_id) ?? null
    const dabbi = resolveRef(balance?.dabbi_colour)
    const dabbiCode = normalisedDabbiCode(dabbi)
    if (!balance || !dabbiCode) {
      return { ok: false, error: `Dispatch line ${line.id.slice(0, 8)} is missing usable dabbi colour data` }
    }
    sourceLines.push({
      id: line.id,
      dabbi_colour_code: dabbiCode,
      quantity_gross: Number(line.quantity_dispatched),
    })
  }

  const calculation = calculateSalesInvoice(
    sourceLines,
    {
      yellow_rate_per_gross: yellowRate,
      white_rate_per_gross: whiteRate,
    },
    {
      transport_charges: input.transportCharges ?? 0,
      other_charges: input.otherCharges ?? 0,
      discount_amount: input.discountAmount ?? 0,
      round_off_amount: input.roundOffAmount ?? 0,
    },
  )

  if (!calculation.ok) return { ok: false, error: calculation.error }

  const invoiceDate = input.invoiceDate ?? event.dispatch_date
  const dueDate = input.dueDate ?? (termsDays > 0 ? addDays(invoiceDate, termsDays) : null)
  const { invoice } = calculation

  const { data: createdRaw, error: invoiceError } = await supabase
    .from('sales_invoices')
    .insert({
      customer_id: customer.id,
      invoice_date: invoiceDate,
      due_date: dueDate,
      status: 'draft',
      customer_name_snapshot: customer.name,
      entity_name_snapshot: customer.entity_name,
      address_snapshot: customer.address,
      phone_snapshot: customer.phone_number,
      transport_name_snapshot: customer.transport_name,
      yellow_rate_per_gross: yellowRate,
      white_rate_per_gross: whiteRate,
      goods_amount: invoice.goods_amount,
      transport_charges: invoice.transport_charges,
      other_charges: invoice.other_charges,
      manual_lines_amount: 0,
      discount_amount: invoice.discount_amount,
      round_off_amount: invoice.round_off_amount,
      total_amount: invoice.total_amount,
      notes: input.notes ?? null,
      created_by: input.actor,
    })
    .select('id')
    .single()

  if (invoiceError || !createdRaw) return { ok: false, error: invoiceError?.message ?? 'Failed to create invoice' }

  const created = createdRaw as CreatedInvoiceRow

  const { error: linkError } = await supabase
    .from('sales_invoice_dispatches')
    .insert({
      sales_invoice_id: created.id,
      dispatch_event_id: input.dispatchId,
    })

  if (linkError) {
    await supabase.from('sales_invoices').delete().eq('id', created.id)
    return { ok: false, error: linkError.message }
  }

  const invoiceLines: SalesInvoiceLineInsert[] = []
  for (const line of dispatchLines) {
    const calculated = lineById(invoice.lines, line.id)
    const balance = balancesById.get(line.ready_stock_balance_id) ?? null
    const shape = resolveRef(balance?.shape_design)
    const colour = resolveRef(balance?.bindi_colour)
    const size = resolveRef(balance?.size)
    const dabbi = resolveRef(balance?.dabbi_colour)
    const brand = resolveRef(balance?.brand)
    const dabbiCode = normalisedDabbiCode(dabbi)

    if (!calculated || !balance || !shape?.name || !colour?.code || !size?.code || !dabbiCode) {
      await supabase.from('sales_invoice_dispatches').delete().eq('sales_invoice_id', created.id)
      await supabase.from('sales_invoices').delete().eq('id', created.id)
      return { ok: false, error: `Dispatch line ${line.id.slice(0, 8)} cannot be converted to an invoice line` }
    }

    invoiceLines.push({
      sales_invoice_id: created.id,
      dispatch_line_id: line.id,
      order_line_id: line.order_line_id,
      ready_stock_balance_id: line.ready_stock_balance_id,
      shape_design_id: balance.shape_design_id,
      bindi_colour_id: balance.bindi_colour_id,
      size_id: balance.size_id,
      dabbi_colour_id: balance.dabbi_colour_id,
      brand_id: balance.brand_id,
      shape_name_snapshot: shape.name,
      bindi_colour_code_snapshot: colour.code,
      size_code_snapshot: size.code,
      dabbi_colour_code_snapshot: dabbiCode,
      brand_name_snapshot: brand?.name ?? null,
      line_type: 'dispatch',
      rate_kind: calculated.rate_kind,
      quantity_gross: calculated.quantity_gross,
      rate_per_gross: calculated.rate_per_gross,
      line_amount: calculated.line_amount,
    })
  }

  const { error: invoiceLinesError } = await supabase
    .from('sales_invoice_lines')
    .insert(invoiceLines)

  if (invoiceLinesError) {
    await supabase.from('sales_invoice_dispatches').delete().eq('sales_invoice_id', created.id)
    await supabase.from('sales_invoices').delete().eq('id', created.id)
    return { ok: false, error: invoiceLinesError.message }
  }

  return { ok: true, invoiceId: created.id, alreadyExisted: false }
}

export async function ensureDraftInvoicesForConfirmedDispatches(
  supabase: SupabaseClient,
  actor: string,
): Promise<{ created: number; errors: string[] }> {
  const { data: linkedDispatchesRaw } = await supabase
    .from('sales_invoice_dispatches')
    .select('dispatch_event_id')

  const linkedDispatchIds = new Set(
    (linkedDispatchesRaw ?? []).map((row) => row.dispatch_event_id as string),
  )

  const { data: dispatchesRaw } = await supabase
    .from('dispatch_events')
    .select('id')
    .eq('status', 'confirmed')
    .order('dispatch_date', { ascending: false })
    .limit(100)

  const unlinkedDispatchIds = (dispatchesRaw ?? [])
    .map((row) => row.id as string)
    .filter((dispatchId) => !linkedDispatchIds.has(dispatchId))

  const errors: string[] = []
  let created = 0
  for (const dispatchId of unlinkedDispatchIds) {
    const result = await createDraftInvoiceForDispatch(supabase, { dispatchId, actor })
    if (result.ok) {
      if (!result.alreadyExisted) created += 1
    } else {
      errors.push(`${dispatchId.slice(0, 8)}: ${result.error}`)
    }
  }

  return { created, errors }
}
