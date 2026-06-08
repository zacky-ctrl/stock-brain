export type PurchaseLineType =
  | 'velvet'
  | 'direct_ready_stock'
  | 'direct_cuttings'
  | 'packaging_material'
  | 'expense'

export type PurchaseBillSourceLine = {
  id: string
  line_type: PurchaseLineType
  description: string
  quantity: number
  rate_per_unit: number
}

export type PurchaseBillCharges = {
  transport_charges?: number
  other_charges?: number
  discount_amount?: number
  round_off_amount?: number
}

export type CalculatedPurchaseBillLine = PurchaseBillSourceLine & {
  line_amount: number
}

export type CalculatedPurchaseBill = {
  lines: CalculatedPurchaseBillLine[]
  goods_amount: number
  inventory_amount: number
  expense_amount: number
  transport_charges: number
  other_charges: number
  discount_amount: number
  round_off_amount: number
  total_amount: number
}

export type PurchaseBillCalculationResult =
  | { ok: true; bill: CalculatedPurchaseBill }
  | { ok: false; error: string }

export type SupplierLedgerEntryInput = {
  id: string
  supplierId: string
  entryDate: string
  createdAt: string
  debitAmount: number
  creditAmount: number
}

export type SupplierLedgerSummary = {
  supplierId: string
  debitTotal: number
  creditTotal: number
  balance: number
}

export type SupplierLedgerRunningEntry<T extends SupplierLedgerEntryInput> = T & {
  runningBalance: number
}

export type PurchasePayableInput = {
  billId: string
  supplierId: string
  billNumber: string | null
  purchaseDate: string
  dueDate: string | null
  totalAmount: number
  allocatedAmount: number
}

export type PurchasePayable = PurchasePayableInput & {
  outstandingAmount: number
}

export type SupplierPaymentAllocationInput = {
  billId: string
  supplierId: string
  outstandingAmount: number
  requestedAmount: number
}

export type SupplierPaymentAllocationPlan = {
  allocatedAmount: number
  unallocatedAmount: number
  overAllocatedAmount: number
  allocations: SupplierPaymentAllocationInput[]
}

export type PurchasePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid'

const INVENTORY_LINE_TYPES: PurchaseLineType[] = [
  'velvet',
  'direct_ready_stock',
  'direct_cuttings',
  'packaging_material',
]

function money(value: number): number {
  return Math.round(value * 100) / 100
}

function qty(value: number): number {
  return Math.round(value * 1000) / 1000
}

function isInventoryLineType(lineType: PurchaseLineType): boolean {
  return INVENTORY_LINE_TYPES.includes(lineType)
}

function compareLedgerEntryAsc(a: SupplierLedgerEntryInput, b: SupplierLedgerEntryInput): number {
  const dateCompare = a.entryDate.localeCompare(b.entryDate)
  if (dateCompare !== 0) return dateCompare

  const createdCompare = a.createdAt.localeCompare(b.createdAt)
  if (createdCompare !== 0) return createdCompare

  return a.id.localeCompare(b.id)
}

export function calculatePurchaseBill(
  sourceLines: PurchaseBillSourceLine[],
  charges: PurchaseBillCharges = {},
): PurchaseBillCalculationResult {
  if (sourceLines.length === 0) {
    return { ok: false, error: 'Purchase bill must have at least one line' }
  }

  const lines: CalculatedPurchaseBillLine[] = []
  let goodsAmount = 0
  let inventoryAmount = 0
  let expenseAmount = 0

  for (const line of sourceLines) {
    const quantity = qty(line.quantity)
    const rate = money(line.rate_per_unit)

    if (!line.description.trim()) {
      return { ok: false, error: `Line ${line.id}: description is required` }
    }
    if (quantity <= 0) {
      return { ok: false, error: `Line ${line.id}: quantity must be greater than zero` }
    }
    if (rate < 0) {
      return { ok: false, error: `Line ${line.id}: rate cannot be negative` }
    }

    const lineAmount = money(quantity * rate)
    const calculatedLine = {
      ...line,
      description: line.description.trim(),
      quantity,
      rate_per_unit: rate,
      line_amount: lineAmount,
    }
    lines.push(calculatedLine)
    goodsAmount = money(goodsAmount + lineAmount)

    if (isInventoryLineType(line.line_type)) {
      inventoryAmount = money(inventoryAmount + lineAmount)
    } else {
      expenseAmount = money(expenseAmount + lineAmount)
    }
  }

  const transportCharges = money(charges.transport_charges ?? 0)
  const otherCharges = money(charges.other_charges ?? 0)
  const discountAmount = money(charges.discount_amount ?? 0)
  const roundOffAmount = money(charges.round_off_amount ?? 0)

  if (transportCharges < 0 || otherCharges < 0 || discountAmount < 0) {
    return { ok: false, error: 'Charges and discount cannot be negative' }
  }

  const totalAmount = money(
    goodsAmount + transportCharges + otherCharges - discountAmount + roundOffAmount,
  )

  if (totalAmount <= 0) {
    return { ok: false, error: 'Purchase bill total must be greater than zero' }
  }

  return {
    ok: true,
    bill: {
      lines,
      goods_amount: goodsAmount,
      inventory_amount: inventoryAmount,
      expense_amount: expenseAmount,
      transport_charges: transportCharges,
      other_charges: otherCharges,
      discount_amount: discountAmount,
      round_off_amount: roundOffAmount,
      total_amount: totalAmount,
    },
  }
}

export function calculateSupplierLedgerSummaries(
  entries: SupplierLedgerEntryInput[],
): SupplierLedgerSummary[] {
  const summaries = new Map<string, SupplierLedgerSummary>()

  for (const entry of entries) {
    const existing = summaries.get(entry.supplierId) ?? {
      supplierId: entry.supplierId,
      debitTotal: 0,
      creditTotal: 0,
      balance: 0,
    }

    existing.debitTotal = money(existing.debitTotal + entry.debitAmount)
    existing.creditTotal = money(existing.creditTotal + entry.creditAmount)
    existing.balance = money(existing.creditTotal - existing.debitTotal)
    summaries.set(entry.supplierId, existing)
  }

  return [...summaries.values()].sort((a, b) => b.balance - a.balance)
}

export function calculateSupplierRunningLedger<T extends SupplierLedgerEntryInput>(
  entries: T[],
): SupplierLedgerRunningEntry<T>[] {
  const sorted = [...entries].sort(compareLedgerEntryAsc)
  let runningBalance = 0

  return sorted.map((entry) => {
    runningBalance = money(runningBalance + entry.creditAmount - entry.debitAmount)
    return {
      ...entry,
      runningBalance,
    }
  })
}

export function calculatePurchasePayables(
  bills: PurchasePayableInput[],
): PurchasePayable[] {
  return bills
    .map((bill) => ({
      ...bill,
      outstandingAmount: money(bill.totalAmount - bill.allocatedAmount),
    }))
    .filter((bill) => bill.outstandingAmount > 0)
    .sort((a, b) => {
      const dueCompare = (a.dueDate ?? a.purchaseDate).localeCompare(b.dueDate ?? b.purchaseDate)
      if (dueCompare !== 0) return dueCompare
      return a.purchaseDate.localeCompare(b.purchaseDate)
    })
}

export function calculateSupplierOutstandingFromBills(
  bills: PurchasePayable[],
  supplierId: string,
): number {
  return money(
    bills
      .filter((bill) => bill.supplierId === supplierId)
      .reduce((total, bill) => total + bill.outstandingAmount, 0),
  )
}

export function calculateSupplierPaymentAllocationPlan(
  paymentAmount: number,
  supplierId: string,
  allocations: SupplierPaymentAllocationInput[],
): SupplierPaymentAllocationPlan {
  const safePaymentAmount = Number.isFinite(paymentAmount) ? Math.max(0, money(paymentAmount)) : 0
  const validAllocations = allocations
    .filter((allocation) => allocation.supplierId === supplierId)
    .map((allocation) => ({
      ...allocation,
      outstandingAmount: Math.max(0, money(allocation.outstandingAmount)),
      requestedAmount: Math.max(0, money(allocation.requestedAmount)),
    }))
    .filter((allocation) => allocation.requestedAmount > 0)

  const allocatedAmount = money(
    validAllocations.reduce((total, allocation) => total + allocation.requestedAmount, 0),
  )
  const overAllocatedAmount = money(Math.max(0, allocatedAmount - safePaymentAmount))

  return {
    allocatedAmount,
    unallocatedAmount: money(Math.max(0, safePaymentAmount - allocatedAmount)),
    overAllocatedAmount,
    allocations: validAllocations,
  }
}

export function calculateAutoSupplierPaymentAllocations<T extends PurchasePayable>(
  paymentAmount: number,
  supplierId: string,
  bills: T[],
): Record<string, number> {
  let remaining = Number.isFinite(paymentAmount) ? Math.max(0, money(paymentAmount)) : 0
  const allocationByBill: Record<string, number> = {}

  for (const bill of bills) {
    if (bill.supplierId !== supplierId || remaining <= 0) continue

    const allocation = Math.min(remaining, bill.outstandingAmount)
    if (allocation > 0) {
      allocationByBill[bill.billId] = money(allocation)
      remaining = money(remaining - allocation)
    }
  }

  return allocationByBill
}

export function resolvePurchasePaymentStatus(
  totalAmount: number,
  allocatedAmount: number,
): PurchasePaymentStatus {
  const total = money(totalAmount)
  const allocated = money(allocatedAmount)

  if (total <= 0) return allocated > 0 ? 'overpaid' : 'unpaid'
  if (allocated <= 0) return 'unpaid'
  if (allocated > total) return 'overpaid'
  if (allocated === total) return 'paid'
  return 'partial'
}
