# System Overview — Stock Brain

## Project Purpose

Stock Brain is a production planning, stock allocation, dispatch management, and
operational reporting system for a bindi manufacturing business.

It is not a simple inventory register. It is a planning engine that tracks the full
lifecycle of stock — from raw velvet through machine cutting, WIP packaging, ready stock,
dispatch (including partial), open balances, and shortage-driven production planning.

Future phases add invoicing, OCR-based data intake, and analytics.

---

## Major System Layers

```
┌──────────────────────────────────────────────────────┐
│  apps/web  (Next.js App Router)                      │
│  UI, routing, forms, print views                     │
│  No business logic — delegates to domain layer       │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│  packages/domain                                      │
│  All business rules, quantity math, validation logic  │
│  Stock lifecycle invariants enforced here             │
│  Dispatch eligibility, override audit rules here      │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│  packages/types                                       │
│  Shared TypeScript types — schema-derived in Phase 2  │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│  Supabase / Postgres (external)                       │
│  Persistent storage, RLS policies, migrations         │
│  Edge Functions for server-side logic if needed       │
└──────────────────────────────────────────────────────┘
```

---

## Likely Architecture Direction

- **Frontend:** Next.js App Router (React Server Components where appropriate)
- **API layer:** Next.js API routes or Supabase Edge Functions
- **Database:** Supabase/Postgres — single source of truth for all stock state
- **Auth:** Supabase Auth (simple role-based — admin, operator)
- **Domain logic:** `packages/domain` — pure TypeScript, testable without a database
- **Migrations:** Supabase CLI managed migrations in `supabase/migrations/`

The architecture deliberately avoids microservices, separate backends, or complex
infrastructure. A single Supabase project + Next.js deployment (Vercel) is the target.

---

## Why Centralized Domain Logic Matters

The core risk in this type of system is that business rules get scattered:
- a check in a form handler here
- a validation in a database trigger there
- a calculation done inline in a React component somewhere else

When that happens, rules diverge. A UI that looks correct can mask wrong data.
A manual override can silently corrupt stock quantities.

All quantity math, lifecycle state transitions, dispatch eligibility checks, and
override validation must live in `packages/domain`. The UI only presents and collects;
it never calculates.

---

## Why Supabase / Postgres

- Row-level security allows fine-grained access control without a separate auth service
- Postgres constraints and triggers can enforce invariants at the database level as a
  second line of defense (after domain logic)
- Supabase provides a real-time layer useful for live dispatch and planning views
- Migrations are version-controlled and repeatable
- Supabase Edge Functions allow server-side execution without a separate backend service

---

## What Is Intentionally Out of Scope for Phase 0

- No schema. No tables. No migrations.
- No Supabase client or connection.
- No authentication.
- No actual business features.
- No dashboard, no data grid, no form.
- No complex state management library.
- No styling system (Tailwind, etc.) — to be chosen in Phase 6 with proper justification.

Phase 0 is solely: correct repo structure, TypeScript setup, workspace wiring, and
documentation that makes every future phase faster and more correct.
