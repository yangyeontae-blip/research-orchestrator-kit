# CLI reference

Run commands from the project root or add `--root <path>`. `rok --help` prints the compact command list.

## Researcher-facing commands

- `rok new [--answers answers.json]`: asks for the idea, `generic`/APA 7/JQI profile, route, method, deadline, institution guidance, and sensitivity; creates `research-brief.json` and the first task.
- `rok next`: claims and prepares the next queued task. API providers require an interactive `SEND` confirmation for every call.
- `rok status [--json]`: shows stage, cycle, approvals, errors, and the optional video branch.
- `rok literature search --query "..."`: queries Crossref and OpenAlex, deduplicates results, and updates the literature manifest.
- `rok literature ingest <pdf|hwp|hwpx> [--id ID]`: validates and locally parses a lawfully held PDF with PDF.js, or an HWP/HWPX file with Kordoc. HWP/HWPX output has no automatic printed-page citation.
- `rok validate [--plan file]`: updates the common quality report and validates standard artifacts.
- `rok export [--format docx|hwpx] [--plan file] [--output file]`: exports the canonical Markdown plan to DOCX (default) or local Kordoc-generated HWPX, and records hashes. HWPX additionally records a local round-trip parse; it is not a visual-layout approval.
- `rok video request [--audience ... --duration 90 --aspect 16:9 --notes ...]`: opens the optional video branch for the current plan.

## Compatible low-level commands

- `rok init --profile generic|apa7|jqi`
- `rok enqueue <request.json>`
- `rok claim <task-id> --agent <name>`
- `rok complete <receipt.json>`
- `rok approve collection <approval.json>`
- `rok approve revision <approval.json>`
- `rok approve video <approval.json>`
- `rok retry <task-id>`

Claims enforce one running task per role. Partial results retain successful artifacts. Approvals bind exact SHA-256 values and become invalid when their source changes.

## Providers

`manual`, `codex`, and `claude` create a human-readable or file handoff. `openai_api` and `anthropic_api` are optional. API keys come only from environment variables; cloud logs store hashes, model, usage, request ID, and time rather than content. Source PDFs and generated office documents are blocked from cloud transfer.
