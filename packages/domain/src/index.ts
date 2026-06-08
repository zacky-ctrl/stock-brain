/**
 * @stock-brain/domain
 *
 * Centralized business logic for Stock Brain.
 *
 * ALL production planning rules, stock allocation logic, dispatch validation,
 * and quantity math MUST live here — never in UI components or API routes.
 *
 * Core invariants this package enforces:
 *   - Dispatch can only draw from ready_stock unless a formal correction is recorded
 *   - cuttings_qty, wip_qty, ready_qty, dispatched_qty, open_qty are always distinct
 *   - open_qty remains active until fully dispatched or explicitly closed with audit record
 *   - Brand and dabbi_colour are meaningful only at packaging/finished stage
 *   - Manual overrides must generate an audit trail entry — no silent mutations
 */

export {
  getPlanningSnapshotForReadyStock,
  type ReadyStockSnapshotFetchers,
} from './planning/ready-stock-snapshot'

export {
  computeOrderLineStatus,
  computeOrderStatusFromLines,
  type OrderLineStatus,
  type OrderStatus,
} from './orders/status'

export {
  computePlanningAllocation,
  compareDemandByPriority,
  type AllocationEngineInput,
} from './planning/allocation-engine'

export {
  MINIMUM_CUTTINGS_BUFFER_GROSS,
  MACHINE_CUTTING_LEAD_TIME_DAYS,
  LABOUR_ISSUE_LEAD_TIME_DAYS,
} from './planning/constants'

export {
  createPlanningOverride,
  resolvePlanningOverride,
  type PlanningOverrideStore,
  type CreatePlanningOverrideInput,
  type CreatePlanningOverrideResult,
  type ResolvePlanningOverrideResult,
} from './planning/overrides'

export {
  reserveStock,
  releaseReservation,
  reassignReservation,
  type ReservationStore,
} from './planning/reservations'

export {
  partialReleaseReservation,
} from './planning/partialRelease'

export {
  amendOrderLine,
  type AmendmentStore,
  type StoredOrderLine,
  type InsertAmendmentRow,
} from './orders/amendments'

export {
  amendOrderHeader,
  type AmendOrderHeaderInput,
  type AmendOrderHeaderResult,
  type OrderHeaderAmendmentStore,
  type StoredOrder,
  type OrderAmendmentRecord,
} from './orders/order-amendments'

export {
  buildMatrixFromOrderLines,
  buildMatrixFromStockBalances,
  buildMatrixFromPlanningRows,
  parseMatrixToOrderLines,
  parseMatrixToDispatchLines,
  filterMatrixData,
  type SizeMasterRow,
  type DesignMasterRow,
  type ColourMasterRow,
  type OrderLineRow,
  type StockBalanceRow,
  type PlanningRowInput,
  type OrderLineInsert,
  type OrderLineForDispatch,
  type DispatchLineInsert,
} from './matrix/builders'

export {
  createCuttingSession,
  confirmCuttingSession,
  voidCuttingSession,
  validateAndDeductCuttingsForLabourJob,
  type CuttingSessionStore,
} from './cutting/cutting-sessions'

export {
  createDispatch,
  type DispatchStore,
  type DispatchLineData,
} from './dispatch/dispatch'

export {
  calculateSalesInvoice,
  resolveSalesRateKind,
  type CalculatedSalesInvoice,
  type CalculatedSalesInvoiceLine,
  type CustomerSalesRates,
  type SalesInvoiceCalculationResult,
  type SalesInvoiceCharges,
  type SalesInvoiceSourceLine,
  type SalesRateKind,
} from './accounting/sales'

export {
  calculateCustomerLedgerSummaries,
  calculateCustomerRunningLedger,
  type CustomerLedgerEntryInput,
  type CustomerLedgerRunningEntry,
  type CustomerLedgerSummary,
} from './accounting/ledger'

export {
  calculateAutoReceiptAllocations,
  calculateCustomerOutstandingFromInvoices,
  calculateInvoiceReceivables,
  calculateReceiptAllocationPlan,
  resolveInvoicePaymentStatus,
  type InvoicePaymentStatus,
  type InvoiceReceivable,
  type InvoiceReceivableInput,
  type ReceiptAllocationInput,
  type ReceiptAllocationPlan,
} from './accounting/receipts'

export {
  calculateAutoSupplierPaymentAllocations,
  calculatePurchaseBill,
  calculatePurchasePayables,
  calculateSupplierLedgerSummaries,
  calculateSupplierOutstandingFromBills,
  calculateSupplierPaymentAllocationPlan,
  calculateSupplierRunningLedger,
  resolvePurchasePaymentStatus,
  type CalculatedPurchaseBill,
  type CalculatedPurchaseBillLine,
  type PurchaseBillCalculationResult,
  type PurchaseBillCharges,
  type PurchaseBillSourceLine,
  type PurchaseLineType,
  type PurchasePayable,
  type PurchasePayableInput,
  type PurchasePaymentStatus,
  type SupplierLedgerEntryInput,
  type SupplierLedgerRunningEntry,
  type SupplierLedgerSummary,
  type SupplierPaymentAllocationInput,
  type SupplierPaymentAllocationPlan,
} from './accounting/purchases'

export {
  METRES_PER_BUNDLE,
  recordVelvetReceipt,
  getVelvetStockBalance,
  type VelvetReceiptStore,
} from './velvet/velvet-receipts'
