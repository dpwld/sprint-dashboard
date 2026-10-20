# Sprint implementation report

## Delivered implementation

- Preserved the original SprintWorkspace and its view/component dependency closure: List, Diagram, Board, Roadmap, Calendar, Due, People and Projects, plus team partitions, task/project forms and drawers, task reassignment/reordering, dates/checkpoints, completion rules, checklists, rich objective/memo editing, project conversion, session undo, comments, mentions, reactions and daily logs.
- Replaced corporate Supabase and staff constants with authenticated owner-scoped D1 HTTP adapters. Initial D1 migrations create schema only. The signed-in identity is displayed without inserting a seeded member record. Additional directory members are user-created.
- Attachments and embedded memo images use authenticated R2 uploads/downloads with D1 ownership metadata. Non-image files download with a safe content type. Files are capped at 20 MB.
- Added real Google Drive browse/create/move adapters, OpenAI translation/work-order/project-assignment adapters and Resend email delivery. Missing setup returns precise 503 errors; API keys are never sent to the browser. Integration credentials are usable only by the explicitly configured integration owner.
- Added an authenticated Grants handoff review screen. Creation requires a button click and a stable owner/grant key prevents duplicate imports. It returns the actual task link and posts the agreed callback only to the known Grants origins.
- Replaced presentation tokens with a white/gray/black palette and local licensed Pretendard. Preserved view-specific information structure. Business records never use localStorage; original layout/language/team preferences still do.

## Executed verification

- `npm run typecheck`: passed.
- `npm run build`: passed through all five Vinext build stages.
- `npm test`: 13 tests passed using actual Miniflare D1 storage and isolated DOM tests, including empty initial storage, CRUD, owner isolation, foreign-parent rejection, invalid-input preservation, HTML sanitation, date checkpoints and completion boundaries, task/project deletion semantics, restore, original sorting/rollup/rules/reactions, and persistence after disposing/restarting Miniflare. Three independent-review regressions were reproduced before correction: simultaneous objective/status writes, escaped markup becoming HTML during memo link/mention formatting, and members loaded after the mention composer module initialized. All three pass after correction.
- D1 updates apply only requested fields atomically with `json_set` and preserve explicit `null` values. Project deletion detaches tasks with the same field-level update rather than replacing their contents. Memo text formatting creates text/element nodes without parsing text as HTML; mention suggestions read the current directory on each input.
- `npm run db:migrate`: applied the generated schema successfully to the local preview database. The tracked local Wrangler config points at the same DB identity and persistence directory as the starter.
- `node tests/http-smoke.mjs`: passed against port 4314. Verified unauthenticated 401, stripped spoofed identity headers, cross-origin write rejection, project/task creation, invalid update preservation, forced server author identity, comments, daily logs, reactions, explicit missing AI setup, R2 bytes upload/download, and idempotent grant import. Test-created local records/files were deleted, with task-linked records removed by cascade logic.
- No paid AI request, real email, company backend or company Drive data was used during verification. Source `.env` files were never read or copied.

## Exact remaining setup and limits

- Hosted deployment, browser visual QA and screenshot capture belong to the parent release task. This report does not claim those have passed.
- Hosted attachments require the declared R2 `BUCKET` binding; core records require D1 `DB` and ChatGPT authentication. Sites production provisioning is verified by the parent during release.
- Optional credentials are listed upfront in README. Real external provider responses are not end-to-end tested without the user’s own credentials. Google token expiration requires replacing the configured access token; OAuth consent/refresh UI is not implemented.
- The account is the server access boundary. Directory members do not receive login invitations or shared access. Original project visibility and member fields are preserved within that owner’s workspace. Cross-account team collaboration and presence are not implemented. Corporate realtime is replaced with 15-second authenticated polling.
- Original project-conversion and multi-record reorder/undo orchestration remains multiple requests. A network failure midway can leave partial changes. Deleting a task deletes its comments/logs/reactions; the original task-only undo restores the task, not those deleted threads.
- The original hidden legacy Notes section remains visible only when it has existing content; the rich Objective editor is the main writing surface for new tasks.
- Sprint timeboxes had no active creation UI in the source workspace and remain absent; tasks reject non-null `sprintId`. There is no CSV/XLSX import beyond the explicit Grants JSON handoff.
- Notification records belong to the current owner’s workspace. Mail can reach directory recipients only after configuring the sender account. This is not cross-account inbox sharing.
- No repo was pushed or deployed by this subagent, and the prepared Sites project ID was preserved exactly.
