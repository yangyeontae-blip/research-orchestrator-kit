# Changelog

## 0.5.1 - 2026-10-11

- Removed the optional pixel office dashboard and `rok office` command at the user's request. `rok status` remains available; the v0.5.0 workflow, video, recovery, and approval changes are preserved.

## 0.5.0 - 2026-10-11

- Failed and partial receipts are accepted even after an input changed; added `rok release`, claim leases, and `rok retry --rebind` so no task can stay running or queued forever.
- Stale `state.lock` files from crashed processes are recovered automatically, and concurrent commands wait briefly instead of failing.
- Added `rok rework` for plans, revisions, review reports, storyboards, and renders, and allowed declining every review item to start a new collection round.
- Approvals, human use checks, and rework now require an interactive terminal; collection-gate scores are read from the plan-bound quality report; literature search and ingest require an approved collection.
- Bundled profiles, schemas, and the example config are used when the project directory has none.
- Replaced the introduction video with a 98-second narrated motion-graphics walkthrough of the orchestrator (hash-bound handoffs, human gates, invalidation, recovery, evidence states), built reproducibly from `docs/video/v0.5/`.
- Reorganized the README around the core ideas, state flow, recovery paths, and verification scope.
- API adapters write to a fresh per-task directory without overwriting, validate the receipt before writing, escape document boundaries, and add timeouts and bounded retries.

## 0.4.1 - 2026-10-11

- Added a local read-only pixel office that reads only the selected research workflow ledger and omits unrelated AI sessions and completed test jobs.
- Bound question–data–analysis mappings and claim provenance to the current plan hash in automated quality checks; semantic and source verification remain human checks.
- Restored running handoffs with `rok next` and added guided `rok finish` and `rok verify-use` while retaining JSON commands.

## 0.4.0 - 2026-10-11

- Separated artifact creation, automated verification, and use verification for plans and rendered videos; downstream gates now wait for recorded use evidence.
- Added artifact-specific checks for plans, DOCX/HWPX exports, video playback and audio, and published README links.
- Added six-field role handoffs covering goal, user decisions, input versions, unresolved items, next action, and completion conditions.
- Kept optional video/HWPX branches and schema-1 request compatibility, including legacy request keys.
- Documented immutable release tags and public-path checks; synthetic tests do not count as external researcher validation.

## 0.3.2 - 2026-10-10

- Rebuilt the public Git history as a single clean release commit after a synthetic test identifier caused the full-history privacy audit to fail.

## 0.3.1 - 2026-10-10

- Repaired the public-history privacy audit fixture so it keeps rejecting unapproved UUID-like values without flagging its own dynamically constructed test value.
- Clarified the README summary around local PDF/HWP/HWPX processing and HWPX export.

## 0.3.0 - 2026-10-10

- Added local Kordoc 4.21.11 parsing for lawfully held HWP/HWPX literature, with file hashes, parser provenance, extracted-text paths, and explicit no-printed-page status.
- Added `rok export --format hwpx` to derive an HWPX research plan from canonical Markdown, record its hash, and attempt a local parse round trip.
- Taught literature and research agents to preserve the distinction between parsing, original-text verification, and visual-layout verification.

## 0.2.3 - 2026-10-10

- Kept the GitHub-native introduction-video asset under an explicit public-identifier allowlist so the privacy audit continues to reject every other UUID-like identifier.

## 0.2.2 - 2026-10-10

- Added GitHub-native inline playback for the README introduction video through a `user-attachments` MP4 asset.

## 0.2.1 - 2026-10-10

- Restored Node.js 20 compatibility for local PDF.js parsing by installing a standards-equivalent `Promise.withResolvers` helper before loading PDF.js.
- Reworked the README video entry into a width-limited clickable preview with an explicit 105-second MP4 playback link.

## 0.2.0 - 2026-10-10

- Added the `rok new`, `next`, `literature`, `validate`, `export`, and `video request` researcher-facing commands.
- Added Crossref/OpenAlex metadata search, DOI/title deduplication, local PDF.js parsing, and partial parsing resume.
- Added evidence ledgers, shared APA 7/JQI/generic quality checks, Markdown-to-DOCX export, and document manifests.
- Added optional OpenAI and Anthropic adapters with per-call confirmation, content-minimized logs, and source-document upload blocking.
- Added a fifth video agent with storyboard/source-map approval and render/QA gates bound to exact hashes.
- Added three v0.2 synthetic cases, package dry-run checks, and an external researcher evaluation protocol.
- Kept state schema 1 compatibility while adding optional artifacts and the video branch.

## 0.1.0 - 2026-10-09

- Added the four-role study, research, literature, and orchestration workflow.
- Added SHA-256-bound collection and revision approval gates.
- Added portable Codex, Claude file-handoff, and manual adapters.
- Added generic, APA Style 7th edition, and JQI profiles.
- Separated APA Style requirements from toolkit-defined proposal sections and institution-specific instructions.
- Added a fully synthetic end-to-end example and public-release audit.
- Added full-history privacy checks and an allowlisted project commit identity.
- Added reproducibility, architecture, evaluation, privacy, and third-party-rights documentation.
- Added Windows and Ubuntu verification in GitHub Actions.

