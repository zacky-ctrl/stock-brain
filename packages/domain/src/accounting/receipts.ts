export type InvoiceReceivableInput = {
  invoiceId: string
  customerId: string
  invoiceNumber: string | null
  invoiceDate: string
  dueDate: string | null
  totalAmount: number
  allocatedAmount: number
}

export type InvoiceReceivable = InvoiceReceivableInput & {
  outstandingAmount: number
}

export type ReceiptAllocationInput = {
  invoiceId: string
  customerId: string
  outstandingAmount: number
  requestedAmount: number
}

export type ReceiptAllocationPlan = {
  allocatedAmount: number
  unallocatedAmount: number
  overAllocatedAmount: number
  allocations: ReceiptAllocationInput[]
}

function money(value: number): number {
  return Math.round(value * 100) / 100
}

export function calculateInvoiceReceivables(
  invoices: InvoiceReceivableInput[],
): InvoiceReceivable[] {
  return invoices
    .map((invoice) => ({
      ...invoice,
      outstandingAmount: money(invoice.totalAmount - invoice.allocatedAmount),
    }))
    .filter((invoice) => invoice.outstandingAmount > 0)
    .sort((a, b) => {
      const dueCompare = (a.dueDate ?? a.invoiceDate).localeCompare(b.dueDate ?? b.invoiceDate)
      if (dueCompare !== 0) return dueCompare
      return a.invoiceDate.localeCompare(b.invoiceDate)
    })
}

export function calculateCustomerOutstandingFromInvoices(
  invoices: InvoiceReceivable[],
  customerId: string,
): number {
  return money(
    invoices
      .filter((invoice) => invoice.customerId === customerId)
      .reduce((total, invoice) => total + invoice.outstandingAmount, 0),
  )
}

export function calculateReceiptAllocationPlan(
  receiptAmount: number,
  customerId: string,
  allocations: ReceiptAllocationInput[],
): ReceiptAllocationPlan {
  const safeReceiptAmount = Number.isFinite(receiptAmount) ? Math.max(0, money(receiptAmount)) : 0
  const validAllocations = allocations
    .filter((allocation) => allocation.customerId === customerId)
    .map((allocation) => ({
      ...allocation,
      outstandingAmount: Math.max(0, money(allocation.outstandingAmount)),
      requestedAmount: Math.max(0, money(allocation.requestedAmount)),
    }))
    .filter((allocation) => allocation.requestedAmount > 0)

  const allocatedAmount = money(
    validAllocations.reduce((total, allocation) => total + allocation.requestedAmount, 0),
  )
  const overAllocatedAmount = money(Math.max(0, allocatedAmount - safeReceiptAmount))

  return {
    allocatedAmount,
    unallocatedAmount: money(Math.max(0, safeReceiptAmount - allocatedAmount)),
    overAllocatedAmount,
    allocations: validAllocations,
  }
}

export function calculateAutoReceiptAllocations<T extends InvoiceReceivable>(
  receiptAmount: number,
  customerId: string,
  invoices: T[],
): Record<string, number> {
  let remaining = Number.isFinite(receiptAmount) ? Math.max(0, money(receiptAmount)) : 0
  const allocationByInvoice: Record<string, number> = {}

  for (const invoice of invoices) {
    if (invoice.customerId !== customerId || remaining <= 0) continue

    const allocation = Math.min(remaining, invoice.outstandingAmount)
    if (allocation > 0) {
      allocationByInvoice[invoice.invoiceId] = money(allocation)
      remaining = money(remaining - allocation)
    }
  }

  return allocationByInvoice
}
