# Use verification

A receipt means that an agent produced files. It does not prove that a researcher opened them or that a published video plays. The state machine records three separate levels: `generated`, `automated_verified`, and `use_verified`.

For a plan or rendered video, find the task ID and exact artifact path/hash with `rok status --json`. Save a local JSON request and run:

```bash
rok verify-use <task-id> <verification.json>
```

First run the automatic check with `task_id`, `kind`, and `artifact: {path, sha256}`. A plan needs a schema-valid `quality-report.json` in its project directory (or set `project_dir`). Its plan hash and `automated.hard_checks_passed` must match. A video needs a matching `video-manifest.json` (or set `manifest_path`), an HTTPS `deployed_url` for its player, and an HTTPS `media_url` that serves byte ranges with HTTP 206. If the automatic check is absent or fails, the task remains `generated` and can be checked again after repair.

Only after doing the actual checks, add `human_confirmation: {confirmed: true, verified_by, checked_at}` and `human_checks`. Each check needs `name`, `result` (`passed` or `failed`), `method`, `evidence`, and `checked_at`. The use reviewer must be someone other than the agent that claimed the task. Do not invent a reviewer, observation, or audio check. A human check without a method or observed evidence stays `not_run`; automatic checks alone never grant `use_verified`.

| Kind | Human check names | What to observe |
|---|---|---|
| `plan` | `evidence_source_checked`, `method_alignment_reviewed` | Follow important citations to sources; compare question, data, and analysis |
| `docx` / `hwpx` | `opened_in_application`, `layout_reviewed`, `content_compared` | Open the actual export, inspect pages/tables/Korean text, compare approved Markdown |
| `video` | `browser_playback`, `seeking`, `audio` | At the published URL, play, seek, and listen |
| `readme` | `rendered_page_opened`, `link_clicked` | Open the published README and follow its key link |

DOCX/HWPX also require a valid container and matching `document-manifest.json`; README verification requires `deployed_url` and `expected_link`. These are available through `verifyArtifactUse` in `src/use-verification.mjs`; the workflow CLI's `verify-use` command is for its pending plan and video tasks.

Generated and automatic states are useful progress, but they must not be described as researcher-tested. Synthetic fixtures exercise the mechanism, not actual human use.
