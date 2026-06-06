'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  calculateSalesInvoice,
  type CalculatedSalesInvoiceLine,
  type SalesInvoiceSourceLine,
} from '@stock-brain/domain'
import { getActorId } from '@/lib/get-actor'
import type { ActionState } from '@/lib/masters'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
  ready_stock_balance: ReadyStockBalanceRow | ReadyStockBalanceRow[] | null
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
  rate_kind: 'yellow' | 'white'
  quantity_gross: number
  rate_per_gross: number
  line_amount: number
}

function resolveRef<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

function formString(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? '').trim()
}

function optionalMoney(formData: FormData, key: string): number {
  const raw = formString(formData, key)
  if (!raw) return 0
  const value = Number(raw)
  return Number.isFinite(value) ? value : Number.NaN
}

function nullableDate(value: string): string | null {
  return value || null
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

export async function createDraftInvoiceFromDispatchAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let redirectTarget: string | null = null

  const dispatchId = formString(formData, 'dispatch_id')
  const invoiceDate = formString(formData, 'invoice_date')
  const dueDateInput = formString(formData, 'due_date')
  const transportCharges = optionalMoney(formData, 'transport_charges')
  const otherCharges = optionalMoney(formData, 'other_charges')
  const discountAmount = optionalMoney(formData, 'discount_amount')
  const roundOffAmount = optionalMoney(formData, 'round_off_amount')
  const notes = formString(formData, 'notes') || null

  if (!dispatchId) return { error: 'Dispatch is required' }
  if (!invoiceDate) return { error: 'Invoice date is required' }

  const moneyValues = [transportCharges, otherCharges, discountAmount, roundOffAmount]
  if (moneyValues.some((value) => !Number.isFinite(value))) {
    return { error: 'One of the amount fields is invalid' }
  }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const { data: existingRaw, error: existingError } = await supabase
    .from('sales_invoice_dispatches')
    .select('sales_invoice_id, sales_invoices(id)')
    .eq('dispatch_event_id', dispatchId)
    .maybeSingle()

  if (existingError) return { error: existingError.message }

  const existing = existingRaw as unknown as ExistingInvoiceLink | null
  const existingInvoice = resolveRef(existing?.sales_invoices)
  const existingInvoiceId = existingInvoice?.id ?? existing?.sales_invoice_id ?? null
  if (existingInvoiceId) {
    redirectTarget = `/accounting/invoices/${existingInvoiceId}`
  } else {
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
      .eq('id', dispatchId)
      .single()

    if (eventError || !eventRaw) return { error: eventError?.message ?? 'Dispatch not found' }

    const event = eventRaw as unknown as DispatchEventRow
    if (event.status !== 'confirmed') return { error: 'Only confirmed dispatches can be invoiced' }

    const customer = resolveRef(event.customers)
    if (!customer) return { error: 'Customer not found for this dispatch' }

    const yellowRate = numberOrNull(customer.yellow_rate_per_gross)
    const whiteRate = numberOrNull(customer.white_rate_per_gross)
    const termsDays = numberOrNull(customer.payment_terms_days) ?? 0

    const { data: dispatchLinesRaw, error: linesError } = await supabase
      .from('dispatch_lines')
      .select(`
        id,
        order_line_id,
        ready_stock_balance_id,
        quantity_dispatched,
        ready_stock_balance:ready_stock_balance_id (
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
        )
      `)
      .eq('dispatch_event_id', dispatchId)
      .order('created_at')

    if (linesError) return { error: linesError.message }

    const dispatchLines = (dispatchLinesRaw ?? []) as unknown as DispatchLineRow[]
    if (dispatchLines.length === 0) return { error: 'Dispatch has no lines to invoice' }

    const sourceLines: SalesInvoiceSourceLine[] = []
    for (const line of dispatchLines) {
      const balance = resolveRef(line.ready_stock_balance)
      const dabbi = resolveRef(balance?.dabbi_colour)
      const dabbiCode = dabbi?.code
      if (!balance || !dabbiCode) {
        return { error: `Dispatch line ${line.id.slice(0, 8)} is missing dabbi colour data` }
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
        transport_charges: transportCharges,
        other_charges: otherCharges,
        discount_amount: discountAmount,
        round_off_amount: roundOffAmount,
      },
    )

    if (!calculation.ok) return { error: calculation.error }

    const dueDate = nullableDate(dueDateInput) ?? (termsDays > 0 ? addDays(invoiceDate, termsDays) : null)
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
        discount_amount: invoice.discount_amount,
        round_off_amount: invoice.round_off_amount,
        total_amount: invoice.total_amount,
        notes,
        created_by: actor,
      })
      .select('id')
      .single()

    if (invoiceError || !createdRaw) return { error: invoiceError?.message ?? 'Failed to create invoice' }

    const created = createdRaw as CreatedInvoiceRow

    const { error: linkError } = await supabase
      .from('sales_invoice_dispatches')
      .insert({
        sales_invoice_id: created.id,
        dispatch_event_id: dispatchId,
      })

    if (linkError) {
      await supabase.from('sales_invoices').delete().eq('id', created.id)
      return { error: linkError.message }
    }

    const invoiceLines: SalesInvoiceLineInsert[] = []
    for (const line of dispatchLines) {
      const calculated = lineById(invoice.lines, line.id)
      const balance = resolveRef(line.ready_stock_balance)
      const shape = resolveRef(balance?.shape_design)
      const colour = resolveRef(balance?.bindi_colour)
      const size = resolveRef(balance?.size)
      const dabbi = resolveRef(balance?.dabbi_colour)
      const brand = resolveRef(balance?.brand)

      if (!calculated || !balance || !shape?.name || !colour?.code || !size?.code || !dabbi?.code) {
        await supabase.from('sales_invoice_dispatches').delete().eq('sales_invoice_id', created.id)
        await supabase.from('sales_invoices').delete().eq('id', created.id)
        return { error: `Dispatch line ${line.id.slice(0, 8)} cannot be converted to an invoice line` }
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
        dabbi_colour_code_snapshot: dabbi.code,
        brand_name_snapshot: brand?.name ?? null,
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
      return { error: invoiceLinesError.message }
    }

    revalidatePath('/dispatch')
    revalidatePath(`/dispatch/${dispatchId}`)
    revalidatePath('/accounting/invoices')
    redirectTarget = `/accounting/invoices/${created.id}`
  }

  if (redirectTarget) redirect(redirectTarget)
  return { error: 'Unable to open invoice' }
}

export async function issueInvoiceAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const invoiceId = formString(formData, 'invoice_id')
  if (!invoiceId) return { error: 'Invoice is required' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const { error } = await supabase.rpc('issue_sales_invoice', {
    p_invoice_id: invoiceId,
    p_actor: actor,
  } as never)

  if (error) return { error: error.message }

  revalidatePath('/accounting/invoices')
  revalidatePath(`/accounting/invoices/${invoiceId}`)
  revalidatePath('/dispatch')
  redirect(`/accounting/invoices/${invoiceId}`)
}
