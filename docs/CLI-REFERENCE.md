# CLI reference

Run commands from the project root or add `--root <path>`. `rok --help` prints the compact command list.

## Execution (v0.6)

- `rok doctor`: checks that Codex CLI, Claude Code, and FFmpeg can be started. On Windows it resolves npm `.cmd` shims; set `ROK_CODEX_BIN` or `ROK_CLAUDE_BIN` to an executable or `.js` entry point for unusual installs. It does not check login state or remaining usage.
- `rok authorize`: interactive only. Shows the run scope (tool, files and SHA-256, search terms, optional KCI and Unpaywall, limits, paid API budget 0) and records it after you type `RUN`.
- `rok run` / `rok resume`: executes queued work inside the approved scope and stops at the next researcher decision, a usage limit, or the call limit. `resume` restarts only interrupted or failed runner work and keeps completed artifacts.
- `rok stop`: asks a running runner to stop; completed artifacts are kept.
- `rok blueprint [--plan file] [--previous blueprint.json]`: extracts the research blueprint with source line ranges; `--previous` adds a text comparison.
- `rok render <research-blueprint.json>`: interactive only. Shows the blueprint hash and renders the silent, captioned 1080p video after you type `RENDER`. Needs the optional renderer (`npm ci --prefix docs/video/v0.5/remotion`).
- `rok preview <video.mp4>`: serves a local player with click-to-play, seeking, and a separate download link.
- `rok bridge`: JSONL bridge for a trusted local chat host; see [chat-execution.md](chat-execution.md).

## Researcher-facing commands

- `rok new [--answers answers.json]`: asks for the idea, `generic`/APA 7/JQI profile, route, method, deadline, institution guidance, and sensitivity; creates `research-brief.json` and the first task.
- `rok next`: claims the next queued task or re-shows a running handoff after interruption. API providers require an interactive `SEND` confirmation for every call.
- `rok finish <task-id>`: interactively records status and actual artifact paths. The engine verifies file hashes; `rok complete` remains available for JSON receipts.
- `rok status [--json]`: shows stage, cycle, approvals, errors, and the optional video branch.
- `rok literature search --query "..."`: queries Crossref and OpenAlex, deduplicates results, and updates the literature manifest.
- `rok literature ingest <pdf|hwp|hwpx> [--id ID]`: validates and locally parses a lawfully held PDF with PDF.js, or an HWP/HWPX file with Kordoc. HWP/HWPX output has no automatic printed-page citation.
- `rok validate [--plan file]`: updates the common quality report and validates standard artifacts.
- `rok export [--format docx|hwpx] [--plan file] [--output file]`: exports the canonical Markdown plan to DOCX (default) or local Kordoc-generated HWPX, and records hashes. HWPX additionally records a local round-trip parse; it is not a visual-layout approval.
- `rok video request [--audience ... --duration 90 --aspect 16:9 --notes ...]`: opens the optional video branch for the current plan.
- `rok collect-more [--gaps "gap 1,gap 2"]`: after evidence review, record named gaps and the current plan/report hashes, then return to a fresh collection approval. Earlier literature is retained and the combined evidence is reviewed again.
- `rok finalize [--document docx|hwpx]`: after an approved revision and use verification, inspect the current quality report and exported document, record actual opening/layout/content checks and remaining limitations, then sign off the exact hashes.
- `rok reopen [--reason "..."]`: preserve finalization history and reopen a finalized workflow when new evidence or changes require more work.

## Compatible low-level commands

- `rok init --profile generic|apa7|jqi`
- `rok enqueue <request.json>`
- `rok claim <task-id> --agent <name>`
- `rok complete <receipt.json>`
- `rok approve collection [approval.json]`
- `rok approve revision [approval.json]` (`"approved_items": [], "decline_all": true` keeps the plan and opens a new collection round)
- `rok approve video [approval.json]`
- `rok retry <task-id> [--rebind]`

Claims enforce one running task per role. Partial results retain successful artifacts. Approvals bind exact SHA-256 values and become invalid when their source changes.

## Human decisions and recovery

- `rok approve`, `rok verify-use` with human checks, `rok rework`, `rok collect-more`, `rok finalize`, and `rok reopen` run only in an interactive terminal and ask for a typed confirmation (`APPROVE`, `VERIFIED`, `REWORK`, `COLLECT`, `FINALIZE`, `REOPEN`). Non-interactive shells, including agent tool calls, are refused. The engine API itself stays scriptable for tests and trusted automation.
- Finalization is a researcher's workflow decision, not journal acceptance. It requires a reviewed revision, plan use verification, current evidence/method/citation quality checks, a matching DOCX/HWPX manifest, observed document checks, and explicitly recorded limitations. Changed bound artifacts mark it stale.
- Collection-gate scores and hard checks are read from `quality-report.json` bound to the current plan hash; only the JQI human rubric total comes from the approval.
- `rok literature search|ingest` require an open literature task whose collection approval matches the current plan hash.
- `rok rework <task-id> [--feedback "..."]` sends a plan or revision (pending use verification or collection approval), a review report (pending revision approval), a storyboard, or a render back with feedback.
- `rok release <task-id> [--reason "..."]` fails a running task that will never report back, so it can be retried. Failed and partial receipts are accepted even when an input changed under the agent; the mismatch is recorded as `binding_warning`.
- Claims carry a lease (`lease_hours` in `config.local.json`, default 72). An expired task is failed when another task for the same role is claimed, and `rok status` flags it.
- `rok retry <task-id> --rebind` re-hashes changed free inputs of a failed, partial, or queued task. Approval-bound plans and reports are never rebound.
- A `state.lock` left by a crashed process (dead PID on this host, or older than two minutes) is removed automatically; a live lock is waited on for up to ten seconds.
- Profiles, schemas, and the example config fall back to the copies bundled with the package, so `rok` works in a project directory outside this repository.

## Providers

`manual`, `codex`, and `claude` create a human-readable or file handoff. `openai_api` and `anthropic_api` are optional. API keys come only from environment variables; cloud logs store hashes, model, usage, request ID, and time rather than content. Source PDFs and generated office documents are blocked from cloud transfer. API artifacts are written only to a new per-task directory (`<project>/tasks/<task-id>/`) and never overwrite existing files. Calls time out after `timeout_ms` (default 180000) without a silent repeat, and rate-limit or server errors are retried up to `max_retries` times (default 2).
