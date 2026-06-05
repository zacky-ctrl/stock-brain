# Module Roadmap — Stock Brain

## Build Order

The modules below are sequenced deliberately. Each phase creates the foundation the next
one requires. Do not skip phases or build them out of order.

---

### Phase 0 — Repo Foundation ✅
**Goal:** Clean monorepo structure, TypeScript workspace, docs, and guidance files.
No business features. No schema.

**Why first:** Every future session benefits from a clean structure. Getting this right
now prevents refactoring cost later.

---

### Phase 1 — Codebase Understanding
**Goal:** Ensure Claude Code and the team have a complete mental model of the repo
structure, workspace wiring, and what belongs where before writing any business code.

**Deliverables:** CLAUDE.md refinements, any missing architectural decisions documented,
confirm pnpm workspace and TypeScript resolution work end-to-end.

---

### Phase 2 — Schema + Supabase Integration
**Goal:** Design and implement the core database schema. Connect Supabase. Write first
migrations. Define types in `packages/types` from the schema.

**This is the highest-stakes phase.** A wrong schema decision here creates compounding
debt through every subsequent module. Take time. Think in invariants, not just columns.

**Key schema areas:**
- Raw stock (velvet)
- Cuttings
- WIP / packaging
- Ready stock
- Dispatch records (full and partial)
- Open balance tracking
- Override / correction records with audit trail
- Master data (sizes, brands, colours, dabbi types)

---

### Phase 3 — Master Data System
**Goal:** CRUD for all reference/master data. Sizes, brands, colours, dabbi types,
customers, machine records. No business logic yet — just the tables and management UI.

**Why before planning engine:** The planning engine depends on master data lookups.
Build the foundation before the logic that uses it.

---

### Phase 4 — Planning Engine
**Goal:** Implement the core production planning and stock allocation logic in
`packages/domain`. This is where shortage detection, production order calculation,
and stock flow validation live.

**This is the intellectual core of the system.** Domain tests are critical here.
The UI for this module is secondary — correct math comes first.

---

### Phase 5 — Dispatch and Partial Dispatch
**Goal:** Full dispatch flow — select orders, allocate from ready stock, record partial
dispatches, track open balances, handle formal stock corrections with audit trail.

**Key invariants:**
- Cannot dispatch from non-ready stock without a formal correction
- Partial dispatch creates a remaining open_qty record
- open_qty stays active until explicitly closed or fully dispatched

---

### Phase 6 — Invoice System
**Goal:** Generate invoices from dispatch records. An invoice reflects what was actually
dispatched, not what was ordered. Handle partial invoice scenarios.

**Note:** Invoice generation is derived from dispatch data. The dispatch system must be
correct before invoicing is built.

---

### Phase 7 — Reports and Print Engine
**Goal:** Operational reports, print-ready dispatch notes, stock summaries, production
planning sheets. This is also when the shared `packages/ui` components get meaningful
content.

---

### Phase 8 — OCR Intake
**Goal:** Allow scanned or photographed source documents (purchase orders, delivery notes)
to be parsed and entered into the system with human verification before committing.

**This is intentionally late in the sequence.** OCR is an intake optimization, not a
core system function. The system must be correct and complete before adding an alternate
data entry path.

---

### Phase 9 — Notifications and Analytics
**Goal:** Low-stock alerts, production planning notifications, trend analysis,
management dashboards.

**Why last:** Notifications and analytics are derived from all preceding modules being
correct. Building dashboards before the underlying data model is sound produces
misleading output.

---

## Why This Order

1. **Foundation before features** — schema errors compound; get it right early.
2. **Domain logic before UI** — a correct calculation shown plainly beats a beautiful
   dashboard showing wrong numbers.
3. **Core flow before optimizations** — dispatch and invoicing work must be solid before
   adding OCR, notifications, or analytics on top.
4. **Master data before planning** — you cannot plan production without stable reference
   data to plan against.
