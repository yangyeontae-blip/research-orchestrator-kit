# Changelog

## Unreleased

- Replaced the recently added three-person chat evaluation package with a researcher self-evaluation checklist. Researchers can check file creation, evidence, method alignment, ethics, and format themselves; a self-score is optional and does not certify research quality.
- Aligned the chat demonstrations and use-verification guidance with the existing researcher-controlled finalization rule. Automated checks and actual human observations remain separate.

## 0.7.0 - 2026-10-13

- Added [docs/AGENT-DESIGN.md](docs/AGENT-DESIGN.md) (roles, LLM-versus-code boundary, execution loop, design decisions, each tied to its source file) and [docs/AUTONOMY.md](docs/AUTONOMY.md) (what runs after one approval, mandatory stop conditions, handling of ambiguous evidence, resume, and stated limits).
- Added `npm run eval` (`scripts/eval-evidence.mjs`): a seeded fault-injection evaluation of the quote-location check with two baselines, now step 5 of `npm run verify`. Results and their limits are in [docs/EVALUATION.md](docs/EVALUATION.md).
- README opens with an agent-design summary in Korean and English.
- Version bumped to 0.7.0 across package, lockfile, citation file, and badges. No runtime behavior of the workflow engine changed.

## 0.6.2 - 2026-10-13

- Checked the live KCI server: a missing key records limited Korean coverage, and an invalid key now shows the reason KCI returns ("등록되지 않은 key 입니다.") without the key. A search with a valid key needs the researcher's own KCI key.
- Verified a clean Codex CLI run with the default call limit (plan and design table, stopped at the use-verification gate).

## 0.6.1 - 2026-10-13

- Ran a synthetic case end to end with real Claude Code calls and live Crossref/OpenAlex/open-access collection, from idea to `finalize` (gates recorded as a labeled synthetic operator, never as a researcher). Fixed everything the run exposed:
  - A first draft is held to draft checks (questions, feasibility, ethics, format, literature decisions); evidence, citation, and design-table checks apply to the revision and to `finalize`. The JQI automated score threshold is removed.
  - Open-access downloads failed on newer Node DNS lookups; a second OpenAlex open-access query and full-text-first ordering find more public PDFs.
  - Collected papers have printed e-mails and similar identifiers masked (and long texts capped) instead of blocking the run; the researcher's own inputs keep the strict check.
  - Reviewers cite plan sentences (P1, P2, ...) and sources (S1, S2, ...) by id; ROK fills in exact text and hashes, corrects a page label only when the exact quote is on exactly one other page, and reports unmatched quotes without counting them.
  - Evidence gaps are review findings, not a partial review; writers label unsupported claims as unverified.
  - Revised plans get a claim ledger from verified quotes and a design table pinned to plan text; narrative and grouped citations are recognized.
  - Model files without an extension or with JSON wrapped in Markdown are accepted; CLI errors printed on stdout (such as usage limits) are reported.
- The introduction video now has Korean narration (Edge TTS, falling back to Google TTS) at 114 seconds.

## 0.6.0 - 2026-10-13

- Completion is now the researcher's decision alone: removed the three-person external evaluation and the 9.5-point target, and added [docs/RESEARCHER-JUDGMENT.md](docs/RESEARCHER-JUDGMENT.md) describing what runs automatically and where the researcher decides.
- Verified the native runner with a real Claude Code call (synthetic idea → plan → stop at the use-verification gate) and fixed what it exposed: worker files now must carry the stage's exact artifact kinds (enforced in the structured-output schema), and a "completed" response without required artifacts becomes partial.
- `rok doctor` and the runner now find Codex and Claude installed as Windows npm `.cmd` shims, with `ROK_CODEX_BIN` / `ROK_CLAUDE_BIN` overrides.
- Worker failures no longer store the CLI's echoed prompt (research text) in the workflow state; usage-limit failures say so plainly and point to `rok resume`.
- Claude responses are saved beside Codex responses for inspection.
- Blueprint extraction recognizes common Korean and English plan headings (e.g. Background, Aims, Methodology, Scope, 문제와 목적) without confusing 연구문제 with 문제의식.
- Rebuilt the blueprint renderer: element coverage, per-element source lines, a question → data → analysis check, a gap summary, before/after comparison, and a duration computed from the plan.
- New 97-second introduction video built from `docs/video/v0.6/`, including real blueprint renderer output; the README now plays it inline. Removed the v0.2/v0.3 video archives and older media from the tree.

## 0.6.0-alpha.1 - 2026-10-13

- Added manual scoped native Codex/Claude execution, stop/recovery, and a trusted local JSONL chat bridge while preserving schema 1 and legacy gates.
- Added bounded OA PDF acquisition, optional KCI metadata lookup, RIS/BibTeX import, and hash/page/quote evidence checks.
- Added source-bound blueprint extraction, text comparisons, optional Remotion rendering with separately approved local audio, and a local range-enabled video player.
- Added synthetic regression coverage and an actual Codex study smoke check. This is a development preview: no external researcher validation, no claim of a fully autonomous end-to-end research run, and no 9.5-score claim.
- Video preview rendering remains a separate action; native CLI account billing and OS isolation remain the host operator’s responsibility.

## 0.5.2 - 2026-10-11

- Added a focused `collect-more` loop that binds explicit evidence gaps and the latest review report to a renewed collection approval, retains earlier literature, and rechecks the combined corpus.
- Added researcher `finalize` and `reopen` decisions. Finalization requires a reviewed revision, current evidence/method/citation quality checks, verified plan use, opened and compared DOCX/HWPX, and recorded limitations; changed artifacts make the sign-off stale.
- Updated role handoffs and Korean/English guidance to distinguish a revised draft from a researcher-confirmed final plan.

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

