<div align="center">

# Research Orchestrator Kit

**A local-first research orchestrator that binds every step, from idea to plan, evidence, and revision, to version-specific hashes.**

[![verify](https://github.com/yangyeontae-blip/research-orchestrator-kit/actions/workflows/verify.yml/badge.svg)](https://github.com/yangyeontae-blip/research-orchestrator-kit/actions/workflows/verify.yml)
![version](https://img.shields.io/badge/version-0.6.0--alpha.1-5EEAD4)
![node](https://img.shields.io/badge/node-20%20%7C%2022-339933?logo=node.js&logoColor=white)
![tests](https://img.shields.io/badge/tests-75%20passing-4ADE80)
![license](https://img.shields.io/badge/license-MIT-A78BFA)

[한국어](README.md) · [Watch the video](https://yangyeontae-blip.github.io/research-orchestrator-kit/video/player/) · [CLI reference](docs/CLI-REFERENCE.md) · [Architecture](docs/ARCHITECTURE.md)

</div>

## Execution system preview

Scoped native CLI execution, OA acquisition, typed evidence checks and source-bound blueprint rendering are available as a development preview. This is not an externally validated release. See [setup, chat bridge and limitations](docs/chat-execution.md).

https://github.com/user-attachments/assets/547d2e3b-6de2-466d-bc64-be61550bb635

## Why

When generative AI assists research, the failure is rarely the model. It is **versions and accountability**: five files called "final", agents that inherit undocumented context, and approvals that silently carry over to an edited plan. This kit coordinates study, research, literature, and video agents through files, SHA-256 digests, and explicit human approval.

## Core ideas

- **Everything is hash-bound.** Every handoff, receipt, and approval records input paths and SHA-256. Change one character of the plan and its earlier approvals become stale.
- **People decide.** Collection, revision, and video approvals and human use checks require an actual human decision, entered interactively or relayed by a trusted local chat host. Gate scores come from the plan-bound quality report, never from the approver.
- **Evidence states stay visible.** Each claim is `original_verified`, `parsed_verified`, `metadata_only`, or `unverified`. Automated checks, AI assessment, and human judgment are separate fields.
- **No dead ends.** `rework`, `release` with claim leases, `retry --rebind`, declining all review items, and automatic stale-lock recovery give every state a next action.
- **Local by default.** PDF, HWP, and HWPX files are parsed locally. Cloud adapters are optional, confirm every call, write only into a fresh per-task directory, and never upload source office documents.
- **Evidence gaps lead to a focused loop.** `rok collect-more` binds named gaps and the review report to renewed collection approval; earlier literature remains available for the next review.
- **The researcher closes the workflow.** `rok finalize` checks the revised plan, evidence/method/citation quality, exported document, actual use review, and recorded limitations before hash-bound sign-off.

## Quick start

```bash
git clone https://github.com/yangyeontae-blip/research-orchestrator-kit.git
cd research-orchestrator-kit
npm ci
npm link
rok new                                  # idea, profile (generic/APA 7/JQI), method, deadline, sensitivity
rok next                                 # hand the next task to its role
rok finish <task-id>                     # record the files actually produced
rok validate                             # plan-bound quality report
rok verify-use <task-id>                 # human use checks (interactive)
rok approve collection                   # shows the bound hashes, asks for APPROVE
rok literature search --query "your topic"
rok literature ingest downloads/paper.pdf
rok export --format docx                 # or hwpx
rok collect-more --gaps "missing evidence" # after a review identifies a gap
rok finalize --document docx             # researcher sign-off after revision and checks
rok status
```

If you get stuck:

```bash
rok rework <task-id> --feedback "..."    # send a plan, review, storyboard, or render back
rok release <task-id> --reason "..."     # reclaim a task whose agent disappeared
rok retry <task-id> --rebind             # re-hash changed free inputs
rok reopen --reason "new evidence"       # preserve finalization history and resume
```

There is no scheduler or heartbeat; the kit acts only on your commands. Runtime state, downloaded papers, parsed text, and generated documents stay in Git-ignored directories.

## Verification

`npm run verify` runs 59 tests (state machine, recovery, human gates, literature, evidence, cloud mocks, DOCX/HWPX export), synthetic APA 7, JQI, and quantitative cases, the npm package allowlist, and a full-history privacy audit. CI runs it on Ubuntu and Windows with Node.js 20 and 22.

See [use verification](docs/USE-VERIFICATION.md) for the evidence each artifact needs. The project targets a 9.5/10 external rating but does not claim it until the protocol in [`docs/EXTERNAL-EVALUATION.md`](docs/EXTERNAL-EVALUATION.md) is completed.

## License

MIT for this project's code and documentation. Third-party academic templates, papers, logos, music, and images belong to their owners. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
