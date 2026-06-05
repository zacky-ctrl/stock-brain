# Business Source Documents

## Purpose

Stock Brain is built from two external business documents that define the operational
reality of the bindi manufacturing business. These documents are the authoritative source
for all business logic until the domain model and database schema are formally defined
and verified in code.

**Do not guess, assume, or invent business rules.**
If a rule is not in the source documents or has not been discussed explicitly, raise it
as a question before implementing it.

---

## Document 1: Business Blueprint

A detailed document covering:
- The production flow from raw velvet stock through cuttings, WIP, packaging, ready stock, and dispatch
- The meaning and significance of each stock state
- Partial dispatch rules and open balance tracking
- Manual override conditions and what requires an audit trail
- Brand and dabbi colour logic (relevant at packaging stage, not at cuttings)
- Shortage detection and production planning logic
- How invoice generation relates to dispatch

**Status:** Held externally. Must be shared with Claude Code at the start of any session
involving schema, domain logic, or business feature implementation.

---

## Document 2: Handoff / Continuation Report

A living document that captures:
- What has been built and decided so far
- What is still unresolved or deferred
- Key decisions and their reasoning
- What the next implementation session should begin with

**Status:** Should be updated at the end of every significant implementation session.
Claude Code can be asked to generate a draft continuation report.

---

## How to use these documents with Claude Code

At the start of a new session that involves schema or business logic:

1. Paste or attach the relevant sections of the business blueprint.
2. Paste the most recent continuation report.
3. State what Phase/module you are working on.
4. Claude Code will then operate with full business context.

Never assume Claude Code has retained business document content from a previous session.
Each session starts fresh unless context is explicitly re-provided.

---

## Transition point

Once the database schema is finalized and domain logic is implemented in `packages/domain`,
these documents will become the verification reference rather than the primary source.
At that point, the schema and domain tests become the ground truth.
