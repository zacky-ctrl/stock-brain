# AGENTS.md — Stock Brain

This file is loaded automatically by Codex at the start of every session.
Read it completely before taking any action in this repo.

---

## Project Identity

**Stock Brain** is a production planning, stock allocation, dispatch management,
operational reporting, and future invoicing system for a bindi manufacturing business.

This is not a prototype. This is not an experiment.
This is a long-term production system being built with engineering discipline.

---

## Project Posture

- Long-term product, not a hackathon project
- Correctness over speed
- Schema discipline before features
- Centralized domain logic before UI
- Audit safety is non-negotiable
- No fake completeness — a half-built feature is worse than no feature

---

## Core Rules

1. **Understand first, plan, then implement.** Never start writing code without
   reading the relevant files and stating your approach.

2. **All business logic lives in `packages/domain`.** Not in API routes.
   Not in React components. Not in database triggers alone. The domain package
   is the single source of truth for all calculations and validation.

3. **Types live in `packages/domain/types` (or `packages/types`).** Never define
   domain types inline in UI components.

4. **Every manual override must produce an audit trail record.** No silent mutations.
   No "just fix the number." The system must know what changed, when, and why.

5. **UI is presentation only.** A form that looks right does not mean the calculation
   is right. Do not trust UI as proof of logic correctness.

6. **Do not add libraries without explicit justification.** State the library, state
   why the existing tools are insufficient, and confirm before adding it.

7. **Do not build schema in isolation.** Schema decisions affect every other layer.
   Think in invariants. Think in audit trails. Think in what must be mathematically
   distinct. Schema is not just tables — it is the formal model of the business.

8. **Work in modules. Do not build across phases in one session.**
   See `docs/modules/module-roadmap.md` for the correct build order.

---

## Business Truths

These are non-negotiable facts about the domain. Never implement anything that violates them.

- **Dispatch can only happen from ready stock** unless a formal stock correction is
  recorded with an audit trail. There is no silent override.

- **Partial dispatch is normal.** After a partial dispatch, the remaining quantity
  becomes open_qty and stays active.

- **open_qty stays active** until fully dispatched or explicitly closed with a reason.
  It does not expire. It does not disappear silently.

- **These quantities are always mathematically distinct and must never be conflated:**
  - `cuttings_qty` — cut from velvet, not yet packaged
  - `wip_qty` — in packaging / labour
  - `ready_qty` — packaged, available for dispatch
  - `dispatched_qty` — confirmed dispatched
  - `open_qty` — ordered but not yet fully dispatched
  - `closed_qty` — formally closed without full dispatch

- **Brand matters at packaging/finished stage.** Cuttings are not brand-specific.

- **Dabbi colour matters at packaging/finished stage.** Cuttings are not colour-specific.

- **Production planning is shortage-driven.** The system detects what is short relative
  to open orders and generates production requirements from that gap.

---

## Working Method for Tasks

For every implementation session:

1. **Read this file** — you are doing it now.
2. **Read the relevant module doc** in `docs/modules/module-roadmap.md`.
3. **Read the task brief** provided by the user (use `docs/prompts/task-brief-template.md`).
4. **Read the relevant existing files** before touching anything.
5. **State your plan** in plain language before writing code.
6. **Implement** the plan.
7. **Summarize** what was built, what was deferred, and what the next session should start with.

---

## Coding Expectations

- TypeScript strict mode. No `any` unless there is no alternative and it is commented.
- No business logic in UI components.
- No hardcoded business constants in UI or API layers — constants belong in `packages/domain`.
- No magic numbers — name everything that is a business rule.
- No unused imports, dead code, or scaffolding left in production files.
- Comments only where the WHY is non-obvious. No "this function calculates X" comments.
- Prefer explicit types over inferred types at module boundaries.

---

## Module Order

See `docs/modules/module-roadmap.md` for the full sequence.

Current phase: **Phase 0 — Complete**
Next phase: **Phase 1 — Codebase Understanding / Phase 2 — Schema + Supabase**

---

## Explicit Warnings

### Do not trust UI as proof of logic
A form that submits without error does not mean the business rule is implemented.
Test domain logic independently of the UI. If there are no domain-layer tests, the logic
is unverified.

### Do not mix business rules into frontend code
The moment a calculation lives in a React component, it becomes invisible to tests,
invisible to audits, and impossible to reuse. Move it to `packages/domain`.

### Do not move forward without proper schema thinking
A wrong column, a wrong relationship, a missing constraint costs ten times more to fix
after data exists. Treat every schema decision as load-bearing.

### Do not hide overrides without auditability
If a user needs to correct a stock number, there must be a record of:
- what the original value was
- what it was changed to
- who changed it
- when
- why (reason field, even if optional initially)

A system that allows silent corrections cannot be trusted for planning or reporting.

### Do not build out of phase order
Features built on an incomplete foundation create structural debt that compounds.
The module roadmap exists for a reason. Follow it.

---

## Planning Engine — Non-Negotiable Rule

The single source of truth for ALL shortage, allocation,
and stock calculations is:

  packages/domain/src/planning/allocation-engine.ts
  → computePlanningAllocation()

### This rule applies to every session, every file

Before writing any code that involves:
- shortage quantities
- stock availability
- what to issue to labour
- what to cut on machine
- what to procure
- ready stock vs demand comparison
- WIP coverage
- cuttings coverage
- priority allocation

Read allocation-engine.ts first.
Then use computePlanningAllocation output fields.
Never compute these values separately in any page,
component, server action, or utility function.

### The output fields to use — never recompute

cuttings_allocated_qty = issue to labour qty (Type 1)
shortage_qty = cut or procure qty (Type 2/3)
ready_allocated_qty = ready stock covering demand
wip_allocated_qty = WIP covering demand
planning_status = the authoritative status per line
recommended_cut_qty = how much to cut on machine
dabbi_colour_id = for dabbi-based grouping
lead_time_days = days until this line can be fulfilled
override_active = whether admin override is in place

### The two shortage types — never combined

Type 1 — Issue to Labour:
  = cuttings_allocated_qty
  = cuttings exist, give to labour today
  = planning_status: give_to_labour

Type 2 — Cut on Machine:
  = shortage_qty where status = cut_on_machine
  = no cuttings, need cutting session

Type 3 — Procure Velvet:
  = shortage_qty where status = procure_velvet
  = nothing in system

Never add Type 1 + Type 2 + Type 3 together.
Always show them as separate buckets.

### Stock matching keys — never mix up

Ready stock and WIP: 5-part key
  shape + bindi_colour + size + dabbi + brand

Cuttings: 3-part key
  shape + bindi_colour + size
  (NO dabbi, NO brand at cuttings stage)

Velvet: shape + size via conversion rates

### Shared fetch function

All pages must fetch planning inputs using:
  apps/web/src/lib/planning-fetcher.ts
  → fetchPlanningInputs(supabase, options?)

No page duplicates the fetch logic.

### Dabbi colour separation

At labour issue stage, dabbi colour matters.
Labour Issue Sheet must always group by dabbi_colour_id
from engine output rows.
Same cuttings SKU for WHITE and YELLOW orders
must always be shown and printed separately.

### Violation = wrong

If any page computes shortage, availability, or
allocation without calling computePlanningAllocation,
that page is wrong regardless of whether numbers
look correct. Stop, read the engine, fix the page.

---

## Dispatch Validation Rule

When validating ready stock for dispatch, **never check `available_qty` alone**.
`available_qty = gross_qty - committed_qty`. If the order being dispatched has its
own active reservation on that balance row, `committed_qty` already includes it —
so `available_qty` appears as 0 even though the stock belongs to this order.

### The correct check

```
const ownReserved = stock_allocations.allocated_qty
  WHERE order_line_id = this line's order_line_id
  AND   ready_stock_balance_id = this balance
  AND   is_active = true
  AND   stock_stage = 'ready'

effective_available = available_qty + ownReserved
if (effective_available < dispatched_qty) → insufficient stock error
```

### Where this is implemented

`packages/domain/src/dispatch/dispatch.ts` → `createDispatch()` validation loop.
The store method `getActiveAllocation(order_line_id, balance_id)` returns
`{ id, allocated_qty }` for the active reservation if one exists.

### Release on dispatch

After a successful dispatch, the reservation must be released so `committed_qty`
falls back. This is done via `store.releaseAllocationById()` in the write phase of
`createDispatch()`, which calls `releaseReservation()` → `setCommittedQty()`.

### Scope of this rule — only dispatch

`reserveStock` (creating a new reservation) correctly validates against `available_qty`
as-is. `available_qty` already excludes prior commitments, so the raw figure is right
when claiming new stock. The adjustment only applies to **dispatch**, where you are
consuming stock you already reserved.

Cuttings (`validateAndDeductCuttingsForLabourJob`) also uses `available_qty` directly.
Cuttings have no per-order-line `stock_allocations` rows — the own-reservation
adjustment does not apply there.

---

## Repo Structure Reference

```
apps/web/          — Next.js frontend app
packages/domain/   — ALL business logic (centralized)
packages/types/    — Shared TypeScript types (schema-derived)
packages/ui/       — Shared UI components (Phase 6+)
packages/utils/    — Pure utility functions
supabase/          — Migrations, seeds, edge functions
docs/business/     — Business blueprint references
docs/architecture/ — System design decisions
docs/modules/      — Module roadmap and phase briefs
docs/prompts/      — Task brief templates
scripts/           — Build and utility scripts
.github/workflows/ — CI/CD
```
