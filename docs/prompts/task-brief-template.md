# Task Brief Template

Use this template at the start of every implementation session with Claude Code.
A well-written brief produces better, more focused output and reduces back-and-forth.

Copy the template below and fill in each section. Remove sections that are not
applicable to the current task, but keep the structure.

---

## Template

```
## Task
[One sentence. What specifically should be built or changed?]

## Why it matters
[Why does this task exist? What breaks or stays broken without it?
Reference the module roadmap phase if applicable.]

## Current state
[What exists now? What is the starting point?
Include file paths if relevant — e.g., `packages/domain/src/dispatch.ts` does not exist yet.]

## Relevant files
[List files that must be read, understood, or changed before starting.
Include the docs/ files if business context is needed.]
- docs/business/source-documents.md
- packages/domain/src/...
- apps/web/src/...
- supabase/migrations/...

## Constraints
[Hard rules this implementation must not violate.]
- All business logic stays in packages/domain, not in UI or API routes
- Any override must generate an audit trail record
- No new libraries without explicit justification
- [Add task-specific constraints]

## Business rules that apply
[List the specific domain rules relevant to this task. Reference the business blueprint
if needed. Do not leave this blank for any domain or schema task.]
- [e.g., Dispatch can only draw from ready_stock unless a formal correction is recorded]
- [e.g., open_qty stays active until fully dispatched or explicitly closed]

## Acceptance criteria
[What must be true when this task is complete? Be specific and testable.]
- [ ] ...
- [ ] ...
- [ ] ...

## Output format
[What should Claude Code produce?]
- [ ] Code changes in specified files
- [ ] Migration file in supabase/migrations/
- [ ] Updated types in packages/types/
- [ ] Domain logic in packages/domain/
- [ ] Summary of what was done and what was deferred

## Risks / assumptions
[What could go wrong? What assumptions are baked in that need validation?]
- [e.g., Assumes master data tables already exist — confirm before writing migrations]
- [e.g., open_qty calculation assumes no concurrent dispatch — verify this is acceptable]

## Do not do
[Explicit exclusions for this task.]
- Do not build UI for this yet
- Do not create schema for adjacent tables — only what this task requires
- [Add task-specific exclusions]
```

---

## Usage notes

- Fill in the business rules section carefully. If you are not sure which rules apply,
  re-read the relevant section of the business blueprint before starting.
- The acceptance criteria section is the definition of done. If you cannot write
  testable criteria, the task is not well-defined enough to implement yet.
- "Do not do" is as important as the task itself. Scope creep in implementation
  sessions causes the most structural damage.
- After the session, update the continuation report (docs/business/source-documents.md
  explains this) with what was built and what was deferred.
