# Research Orchestrator Kit

Research Orchestrator Kit is a Korean-first local CLI that turns a research idea into an evidence-traceable proposal. It supports explicit `generic`, APA 7, and JQI profiles, local PDF/HWP/HWPX processing, Markdown-to-DOCX/HWPX export, and optional OpenAI or Anthropic adapters.

Version 0.4.0 distinguishes generated artifacts, passed automated checks, and verified end-user use. Plans cannot reach collection approval, and videos cannot be marked complete, until artifact-specific use checks are recorded.

Five roles share files and SHA-256 bindings: orchestrator, study, research, literature, and video. Human gates bind collection approval to the plan, revision approval to the evidence report, and video approval to the plan, storyboard, and source map.

## Quick start

```bash
npm install
npm link
rok new
rok status
rok next
```

Useful commands:

```bash
rok literature search --query "your topic"
rok literature ingest downloads/paper.pdf
rok validate
rok export
rok video request
rok verify-use <task-id> <verification.json>
```

Runtime state, downloaded papers, parsed text, and generated documents remain in Git-ignored local directories. Cloud adapters require confirmation for every call, use environment variables for API keys, and reject PDF/DOCX/HWP/HWPX uploads.

See [use verification](docs/USE-VERIFICATION.md) for the required evidence. Run `npm run verify` before release. The project targets a 9.5/10 external rating, but does not claim that score until the evaluation protocol in `docs/EXTERNAL-EVALUATION.md` is completed.

MIT licensed. APA and JQI names identify compatibility targets; this project is not affiliated with either organization and does not redistribute their manuals or templates.
