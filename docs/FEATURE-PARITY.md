# Sprint feature parity inventory

Source: original `src/components/pm/SprintWorkspace.tsx` and its direct/transitive dependency closure. This inventory is written before implementation. Original company source is read-only. No company data or production connection is copied.

| Original feature | Preserved implementation | Implemented checks / remaining checks |
|---|---|---|
| Engineering / Manufacturing / Business partitions | Original team tabs and typed `PmTeam` | Filters remain on all views |
| List, Diagram, Board, Roadmap, Calendar, Due, People, Projects | Original view components | Original components build/typecheck; parent browser QA pending |
| Tasks / projects create, inline edit, delete, reorder, move | Original forms, drawers and handlers; authenticated D1 API | D1 and HTTP tests passed for CRUD, validation, owner isolation and persistence |
| Task dates, checkpoints, completion timestamps, priority and status | Original contracts and date/rollup rules | Domain/date/update tests passed |
| Checklist, rich memo, objective and definition of done | Original editor and drawer | D1 roundtrip and server HTML sanitation tests passed |
| Convert checklist task to project; project/task undo | Original orchestration and restore contracts | Restore/reference tests passed; original multi-request conversion is not atomic |
| Comments, mentions, reactions | Original composer and reaction controls; D1 records | HTTP/D1 parent, owner and server author checks passed |
| Daily logs | Original DailyLog with task/project contracts | HTTP/D1 validation and persistence passed |
| Members and project visibility/co-owners | Empty user-owned member directory and original selectors | User-created directory API; account isolation, no cross-account invitations |
| Attachments and memo images | Original file UI; authenticated R2 API | Real R2 upload/download byte check passed |
| Drive browse/scaffold | Real Google Drive HTTP adapter | Missing-config error implemented; full URL/ID parser tested; no external calls |
| Korean/English cached translation | Original toggle/cache; real provider adapter | Missing-key HTTP 503 verified; provider response QA awaits own credentials |
| AI work order / project assignment | Original actions; real provider adapter | Missing-key HTTP 503 verified; provider response QA awaits own credentials |
| Email / in-service notifications | Original triggers; server adapters and stored status | Stored in-service notices; owner-gated Resend adapter; mail untested without own credentials |
| Live changes | Authenticated periodic fetch replaces corporate Supabase realtime | 15-second polling implemented; browser timing QA pending |
| Grants → task handoff | Authenticated review at `/import/grant` | Authenticated HTTP retry returns same task ID; popup callback implemented |

Completion status and exact limitations are recorded in IMPLEMENTATION-REPORT.md after verification.
