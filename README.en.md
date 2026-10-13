<div align="center">

# Research Orchestrator Kit

### Researchers decide. Agents execute.

**From a research idea to an evidence-backed proposal and a blueprint video. Codex and Claude do the work inside a scope you approve once; you are asked only when a research decision is needed.**

[![verify](https://github.com/yangyeontae-blip/research-orchestrator-kit/actions/workflows/verify.yml/badge.svg)](https://github.com/yangyeontae-blip/research-orchestrator-kit/actions/workflows/verify.yml)
![version](https://img.shields.io/badge/version-0.6.1-5EEAD4)
![node](https://img.shields.io/badge/node-20%20%7C%2022-339933?logo=node.js&logoColor=white)
![tests](https://img.shields.io/badge/tests-99%20passing-4ADE80)
![license](https://img.shields.io/badge/license-MIT-A78BFA)

[한국어](README.md) · [Video player](https://yangyeontae-blip.github.io/research-orchestrator-kit/video/player/) · [CLI reference](docs/CLI-REFERENCE.md) · [Researcher judgment](docs/RESEARCHER-JUDGMENT.md)

</div>

https://github.com/user-attachments/assets/9dff1b4b-2aa1-4adc-8f84-1e53e637f918

## Why

Researchers still spend real time relaying files between chats, reconciling versions such as `plan_final_REAL.docx`, and reviving work that stopped on an error or usage limit. ROK hands that work to agents and keeps the researcher's time for the questions that matter: does this source really support this claim, and can this data answer this question?

## What it does

- **Approve once, then run.** Purpose and format, the files to send with their hashes, search terms, the tool, work limits, and a paid-API budget of zero are approved together; `rok run` then collects, drafts, and reviews.
- **Agents that actually work.** Your signed-in **Codex CLI** or **Claude Code** performs each task. Drafting and review run in separate sessions.
- **From metadata to full text.** Crossref, OpenAlex, optional KCI, RIS/BibTeX import, Unpaywall open-access PDFs, title matching, and local parsing. Unavailable, scanned, or mismatched sources are never counted as success.
- **Down to the page and sentence.** Claim → source → file hash → page and quote → support, contradiction, or context. A quote missing from the cited page is flagged.
- **Blueprint video from the plan.** Problem, purpose, questions, concepts, data, analysis, ethics, contribution, and limitations are extracted with source lines and rendered; missing elements stay "unconfirmed".
- **Stop and continue.** Usage limits, interruptions, and errors keep completed work; `rok resume` continues where it stopped, with no silent switch to paid APIs.
- **The researcher completes it.** Completion is the researcher's `finalize` decision against the current file hashes, not an external score.

## Quick start

```bash
git clone https://github.com/yangyeontae-blip/research-orchestrator-kit.git
cd research-orchestrator-kit
npm ci
npm link
rok doctor                     # finds Codex CLI, Claude Code, FFmpeg
rok new                        # idea, profile (generic/APA 7/JQI), method, deadline
rok authorize                  # review the run scope, type RUN
rok run                        # executes until the next researcher decision
rok status
```

At each stop you decide: `rok verify-use`, `rok approve collection`, `rok approve revision`, `rok collect-more`, and finally `rok finalize`. These record human decisions and are refused from non-interactive shells. `rok stop` and `rok resume` interrupt and continue. `rok blueprint`, `rok render`, and `rok preview` produce and play the blueprint video. A chat host can drive the same operations through `rok bridge` ([chat execution](docs/chat-execution.md)).

## Verification

`npm run verify` runs 99 tests, synthetic APA 7, JQI, and quantitative cases, the npm package allowlist, and a full-history privacy audit. CI covers Ubuntu and Windows with Node.js 20 and 22. A synthetic case was run end to end with real Claude Code calls and live Crossref/OpenAlex/open-access collection, from exploratory search through review, rework, a revision passing every automated check, and `finalize`; human gates were recorded as a labeled synthetic operator, never as a researcher. KCI live calls are not yet verified (no API key in this environment).

## License

MIT for this project's code and documentation. The optional Remotion renderer has its own license. Third-party templates, papers, logos, music, and images belong to their owners. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
