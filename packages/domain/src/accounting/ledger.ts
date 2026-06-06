export type CustomerLedgerEntryInput = {
  id: string
  customerId: string
  entryDate: string
  createdAt: string
  debitAmount: number
  creditAmount: number
}

export type CustomerLedgerSummary = {
  customerId: string
  debitTotal: number
  creditTotal: number
  balance: number
}

export type CustomerLedgerRunningEntry<T extends CustomerLedgerEntryInput> = T & {
  runningBalance: number
}

function money(value: number): number {
  return Math.round(value * 100) / 100
}

function compareLedgerEntryAsc(a: CustomerLedgerEntryInput, b: CustomerLedgerEntryInput): number {
  const dateCompare = a.entryDate.localeCompare(b.entryDate)
  if (dateCompare !== 0) return dateCompare

  const createdCompare = a.createdAt.localeCompare(b.createdAt)
  if (createdCompare !== 0) return createdCompare

  return a.id.localeCompare(b.id)
}

export function calculateCustomerLedgerSummaries(
  entries: CustomerLedgerEntryInput[],
): CustomerLedgerSummary[] {
  const summaries = new Map<string, CustomerLedgerSummary>()

  for (const entry of entries) {
    const existing = summaries.get(entry.customerId) ?? {
      customerId: entry.customerId,
      debitTotal: 0,
      creditTotal: 0,
      balance: 0,
    }

    existing.debitTotal = money(existing.debitTotal + entry.debitAmount)
    existing.creditTotal = money(existing.creditTotal + entry.creditAmount)
    existing.balance = money(existing.debitTotal - existing.creditTotal)
    summaries.set(entry.customerId, existing)
  }

  return [...summaries.values()].sort((a, b) => b.balance - a.balance)
}

export function calculateCustomerRunningLedger<T extends CustomerLedgerEntryInput>(
  entries: T[],
): CustomerLedgerRunningEntry<T>[] {
  const sorted = [...entries].sort(compareLedgerEntryAsc)
  let runningBalance = 0

  return sorted.map((entry) => {
    runningBalance = money(runningBalance + entry.debitAmount - entry.creditAmount)
    return {
      ...entry,
      runningBalance,
    }
  })
}
