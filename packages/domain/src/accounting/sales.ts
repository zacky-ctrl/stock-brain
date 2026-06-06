export type SalesRateKind = 'yellow' | 'white'

export type SalesInvoiceSourceLine = {
  id: string
  dabbi_colour_code: string
  quantity_gross: number
}

export type CustomerSalesRates = {
  yellow_rate_per_gross: number | null
  white_rate_per_gross: number | null
}

export type SalesInvoiceCharges = {
  transport_charges?: number
  other_charges?: number
  manual_lines_amount?: number
  discount_amount?: number
  round_off_amount?: number
}

export type CalculatedSalesInvoiceLine = {
  source_line_id: string
  rate_kind: SalesRateKind
  quantity_gross: number
  rate_per_gross: number
  line_amount: number
}

export type CalculatedSalesInvoice = {
  lines: CalculatedSalesInvoiceLine[]
  yellow_gross: number
  white_gross: number
  goods_amount: number
  transport_charges: number
  other_charges: number
  manual_lines_amount: number
  discount_amount: number
  round_off_amount: number
  total_amount: number
}

export type SalesInvoiceCalculationResult =
  | { ok: true; invoice: CalculatedSalesInvoice }
  | { ok: false; error: string }

function money(value: number): number {
  return Math.round(value * 100) / 100
}

function qty(value: number): number {
  return Math.round(value * 1000) / 1000
}

function normaliseDabbiCode(code: string): string {
  return code.trim().toUpperCase()
}

export function resolveSalesRateKind(dabbiColourCode: string): SalesRateKind | null {
  const code = normaliseDabbiCode(dabbiColourCode)
  if (code === 'YELLOW') return 'yellow'
  if (code === 'WHITE') return 'white'
  return null
}

function getRate(rateKind: SalesRateKind, rates: CustomerSalesRates): number | null {
  return rateKind === 'yellow' ? rates.yellow_rate_per_gross : rates.white_rate_per_gross
}

export function calculateSalesInvoice(
  sourceLines: SalesInvoiceSourceLine[],
  rates: CustomerSalesRates,
  charges: SalesInvoiceCharges = {},
): SalesInvoiceCalculationResult {
  if (sourceLines.length === 0) {
    return { ok: false, error: 'Invoice must have at least one dispatch line' }
  }

  const lines: CalculatedSalesInvoiceLine[] = []
  let yellowGross = 0
  let whiteGross = 0
  let goodsAmount = 0

  for (const line of sourceLines) {
    if (line.quantity_gross <= 0) {
      return { ok: false, error: `Line ${line.id}: quantity must be greater than zero` }
    }

    const rateKind = resolveSalesRateKind(line.dabbi_colour_code)
    if (!rateKind) {
      return { ok: false, error: `Line ${line.id}: unsupported dabbi colour ${line.dabbi_colour_code}` }
    }

    const rate = getRate(rateKind, rates)
    if (rate === null || rate < 0) {
      return { ok: false, error: `Line ${line.id}: ${rateKind} rate per gross is missing` }
    }

    const quantityGross = qty(line.quantity_gross)
    const lineAmount = money(quantityGross * rate)
    lines.push({
      source_line_id: line.id,
      rate_kind: rateKind,
      quantity_gross: quantityGross,
      rate_per_gross: money(rate),
      line_amount: lineAmount,
    })

    if (rateKind === 'yellow') yellowGross = qty(yellowGross + quantityGross)
    else whiteGross = qty(whiteGross + quantityGross)
    goodsAmount = money(goodsAmount + lineAmount)
  }

  const transportCharges = money(charges.transport_charges ?? 0)
  const otherCharges = money(charges.other_charges ?? 0)
  const manualLinesAmount = money(charges.manual_lines_amount ?? 0)
  const discountAmount = money(charges.discount_amount ?? 0)
  const roundOffAmount = money(charges.round_off_amount ?? 0)

  if (transportCharges < 0 || otherCharges < 0 || manualLinesAmount < 0 || discountAmount < 0) {
    return { ok: false, error: 'Charges and discount cannot be negative' }
  }

  const totalAmount = money(goodsAmount + transportCharges + otherCharges + manualLinesAmount - discountAmount + roundOffAmount)
  if (totalAmount < 0) {
    return { ok: false, error: 'Invoice total cannot be negative' }
  }

  return {
    ok: true,
    invoice: {
      lines,
      yellow_gross: yellowGross,
      white_gross: whiteGross,
      goods_amount: goodsAmount,
      transport_charges: transportCharges,
      other_charges: otherCharges,
      manual_lines_amount: manualLinesAmount,
      discount_amount: discountAmount,
      round_off_amount: roundOffAmount,
      total_amount: totalAmount,
    },
  }
}

