# Accounting Blueprint

## Purpose

Accounting in Stock Brain must control business money without weakening the
stock, dispatch, and audit model. The first accounting milestone is sales
accounting: invoice what was actually dispatched, record receipts, and show
customer outstanding.

This is not a GST/tax module. Current money calculation is:

```text
goods amount + transport charges + other charges - discount + round off = invoice total
```

## Product Boundary

Accounting stays inside Stock Brain as a separate module. It shares customers,
dispatches, users, and audit history with operations. The UI should not expose
debit/credit language to normal operators, but the database foundation must be
able to grow into purchases, supplier ledgers, cash book, bank book, profit and
loss, assets, and balance sheet.

## Sales Accounting Rules

1. Dispatch is a stock movement; invoice is the money document.
2. An invoice must be based on confirmed dispatch quantities, not ordered qty.
3. Invoice lines snapshot SKU labels and rates. Later master-data changes must
   not alter old invoices.
4. Customer billing name, address, phone, and transport are snapshotted on the
   invoice.
5. Yellow and white rates are per gross.
6. No GST or tax calculation is included in the current foundation.
7. Transport charge is separate from goods amount and included in invoice total.
8. Issued invoices are locked. Wrong issued invoices should be cancelled with a
   reason and recreated, not silently edited.
9. Receipts are append-safe money records. Wrong receipts should be voided or
   reversed with a reason, not deleted.
10. Customer outstanding is calculated from ledger entries, not manually typed.

## First Implementation Spine

```text
confirmed dispatch
  -> sales invoice draft/issued
  -> sales invoice lines
  -> customer ledger debit
  -> receipt
  -> customer ledger credit
  -> outstanding
```

## Future Accounting Spine

The schema includes a general-ledger skeleton:

- chart of accounts
- journal entries
- journal lines

Sales accounting will post:

```text
Invoice issued:
  Dr Customer Receivables
  Cr Sales Goods
  Cr Transport Charges Recovered

Receipt confirmed:
  Dr Cash / Bank
  Cr Customer Receivables
```

Purchases, supplier payments, cash book, bank book, P&L, and balance sheet should
use the same journal foundation later.

## Automation Boundary

WhatsApp and scheduled reminders must not send directly from invoice/receipt
actions. The accounting event should create a notification job later. A separate
notification worker or n8n flow sends the message and writes delivery status.

