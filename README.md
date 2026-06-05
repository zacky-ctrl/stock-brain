# Stock Brain

Production planning, stock allocation, dispatch management, operational reporting,
and invoicing system for a bindi manufacturing business.

---

## What Stock Brain Is

Stock Brain is a planning engine — not just a ledger.

It tracks the full lifecycle of stock:

```
Velvet (raw) → Machine Cutting → WIP / Packaging Labour → Ready Stock
    → Dispatch (full or partial) → Open Balance → Closed / Invoiced
```

It connects:
- Raw velvet stock and cutting decisions
- WIP and packaging labour
- Ready stock by brand and dabbi colour
- Dispatch planning and partial dispatch
- Open quantity tracking
- Shortage detection and production planning
- Manual override with full audit trail
- Future: invoice generation, OCR intake, analytics

---

## What Stock Brain Is Not

- Not a simple inventory register
- Not an order tracking spreadsheet
- Not a prototype or experiment
- Not a single-session build

---

## Current Build Posture

**Phase 0 — Foundation complete.**

The repo structure, TypeScript workspace, and documentation are in place.
No business features have been built yet. No schema. No UI flows.

Phase 1 (schema design + Supabase integration) is the next major step.

See `docs/modules/module-roadmap.md` for the full build sequence.

---

## High-Level Module Order

| Phase | Module                            |
|-------|-----------------------------------|
| 0     | Repo foundation ✅                |
| 1     | Codebase understanding            |
| 2     | Schema + Supabase integration     |
| 3     | Master data system                |
| 4     | Planning engine (domain logic)    |
| 5     | Dispatch and partial dispatch     |
| 6     | Invoice system                    |
| 7     | Reports and print engine          |
| 8     | OCR intake                        |
| 9     | Notifications and analytics       |

---

## Local Setup

### Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)

### Install

```bash
pnpm install
```

### Run the web app

```bash
pnpm dev
```

Opens at `http://localhost:3000`.
Currently shows a placeholder page — no business features exist yet.

### Type check all packages

```bash
pnpm type-check
```

### Build for production

```bash
pnpm build
```

---

## Repo Structure

```
stock-brain/
├── apps/
│   └── web/                   # Next.js frontend (App Router)
│       └── src/app/
├── packages/
│   ├── domain/                # ALL business logic — centralized
│   ├── types/                 # Shared TypeScript types
│   ├── ui/                    # Shared UI components (Phase 6+)
│   └── utils/                 # Pure utility functions
├── supabase/
│   ├── migrations/            # Versioned DB migrations (Phase 2+)
│   ├── seeds/                 # Seed data scripts
│   └── functions/             # Supabase Edge Functions
├── docs/
│   ├── business/              # Business blueprint references
│   ├── architecture/          # System design decisions
│   ├── modules/               # Module roadmap
│   └── prompts/               # Task brief templates for Claude Code
├── scripts/                   # Build and utility scripts
├── .github/workflows/         # CI: type check + build on push
├── CLAUDE.md                  # Claude Code guidance (read every session)
├── .env.example               # Environment variable reference
└── README.md
```

---

## How Claude Code Is Used in This Repo

Claude Code is the primary implementation partner for this project.

**Every session starts with:**
1. Claude Code reading `CLAUDE.md`
2. User providing a task brief (see `docs/prompts/task-brief-template.md`)
3. Claude Code reading relevant files before touching anything
4. Claude Code stating a plan before writing code

**Claude Code must not:**
- Write business logic in UI components
- Build out of phase order
- Invent schema without explicit planning
- Add libraries without justification
- Produce fake completeness

**Claude Code must always:**
- Centralize domain logic in `packages/domain`
- Ensure overrides generate audit trail records
- Summarize what was built and what is deferred at the end of each session
- Work in modules — one phase at a time

For detailed rules, read `CLAUDE.md`.
