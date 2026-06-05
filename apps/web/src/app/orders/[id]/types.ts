import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'
import type { PlanningLineStatus } from '@stock-brain/types'

export type LineAmendmentRecord = {
  id: string
  amended_at: string
  amended_by: string
  field_amended: string
  old_value: string
  new_value: string
  reason: string
}

export type OrderLineForDisplay = {
  id: string
  order_id: string
  shape: string
  bindi_colour: string
  size: string
  dabbi: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  ordered_qty: number
  dispatched_qty: number
  closed_qty: number
  open_qty: number
  line_status: string
  promised_date: string | null
  amendments: LineAmendmentRecord[]
}

export type HeaderAmendmentRecord = {
  id: string
  amended_at: string
  field_amended: string
  old_value: string
  new_value: string
  reason: string
}

export type ExtraSkuOption = {
  id: string
  label: string
  gross_qty: number
  committed_qty: number
  available_qty: number
}

export type EngineRow = {
  order_line_id: string
  ready_allocated_qty: number
  cuttings_allocated_qty: number
  shortage_qty: number
  planning_status: PlanningLineStatus
  recommended_cut_qty: number
  wip_allocated_qty: number
  cuttings_available_qty: number
  dabbi_colour_id: string
}

export type DispatchLine = {
  key: string
  order_line_id: string | null
  quantity_dispatched: number
  line_type: string
  shape: string
  bindi_colour: string
  size: string
  dabbi: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
}

export type DispatchEventFull = {
  id: string
  dispatch_date: string
  reference: string | null
  notes: string | null
  orderedQty: number
  extrasQty: number
  totalQty: number
  lines: DispatchLine[]
}

export type ChallanCellEntry = {
  key: string
  shape: string
  bindi_colour: string
  size: string
  qty: number
}

export type OrderDetailClientProps = {
  orderId: string
  orderStatus: string
  orderCustomerId: string
  orderDate: string
  orderReference: string | null
  orderNotes: string | null
  customerName: string
  customerBrandRule: string
  displayStatus: string
  linesForDisplay: OrderLineForDisplay[]
  engineRows: EngineRow[]
  activeAllocations: { order_line_id: string; allocated_qty: number }[]
  totalOrdered: number
  totalOrderedDispatched: number
  totalExtrasSent: number
  totalOpen: number
  totalClosed: number
  fulfilmentPct: number
  totalReadyCovers: number
  totalType1: number
  totalType2: number
  totalType3: number
  totalRecommendedCut: number
  labourDabbiBreakdown: { code: string; qty: number }[]
  dispatchHistory: DispatchEventFull[]
  headerAmendments: HeaderAmendmentRecord[]
  sizeMaster: SizeMasterRow[]
  designMaster: DesignMasterRow[]
  colourMaster: ColourMasterRow[]
  dabbiMaster: { id: string; code: string; sort_order: number }[]
  brandMaster: { id: string; name: string }[]
  customerOptions: { id: string; name: string }[]
  extraStockOptions: ExtraSkuOption[]
  priorityBadgeText: string
  hasAnyOverride: boolean
  dayCount: number
  isOrderClosed: boolean
  canCloseOrder: boolean
  openLineCount: number
  totalReservedQty: number
  challanSizesArr: { id: string; code: string; name: string; sort_order: number }[]
  challanRowKeys: string[]
  challanCellTotalsArr: ChallanCellEntry[]
  printedAt: string
}
