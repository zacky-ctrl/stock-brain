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
