<div align="center">

# Research Orchestrator Kit

### Researchers decide. Agents execute.

**From a research idea to an evidence-backed proposal and a blueprint video. Codex and Claude do the work inside a scope you approve once; you are asked only when a research decision is needed.**

[![verify](https://github.com/yangyeontae-blip/research-orchestrator-kit/actions/workflows/verify.yml/badge.svg)](https://github.com/yangyeontae-blip/research-orchestrator-kit/actions/workflows/verify.yml)
![version](https://img.shields.io/badge/version-0.7.0-5EEAD4)
![node](https://img.shields.io/badge/node-20%20%7C%2022-339933?logo=node.js&logoColor=white)
![tests](https://img.shields.io/badge/tests-104%20passing-4ADE80)
![license](https://img.shields.io/badge/license-MIT-A78BFA)

[한국어](README.md) · [Video player](https://yangyeontae-blip.github.io/research-orchestrator-kit/video/player/) · [CLI reference](docs/CLI-REFERENCE.md) · [Researcher judgment](docs/RESEARCHER-JUDGMENT.md)

</div>

## Try it first: get a proposal through conversation in Codex

No install and no `rok` command needed. **Open this repository in Codex and say:**

```text
Following this repository's AGENTS.md, discuss my research idea with me, then draft a research proposal.
```

[`AGENTS.md`](AGENTS.md) is the agent. It assumes no default topic. When invoked it (0) checks that it can write files and, if not, tells you before the discussion to restart with `codex --sandbox workspace-write`; (1) asks up to three questions at a time about research type, format, participants, and timeline, never choosing a format for you; (2) offers 2-3 research directions with trade-offs and lets you choose; (3) summarizes questions, data, analysis, and ethics for your explicit agreement; and (4) writes `workspace/<topic>/proposal-draft.md` after an eight-point self-check, with an appendix quoting your agreement in your own words. Evidence not checked against the literature is marked `[미확인: 문헌 확인 필요]`, and it never invents citations or numbers; without search access it writes a search plan (keywords, databases, inclusion criteria) instead. Model and reasoning effort in [`.codex/config.toml`](.codex/config.toml) are recommendations: if unavailable, the agent says so and continues with an available model. Literature collection, hash approvals, and independent review (the `rok` workflow below) are optional follow-ups. Recorded runs on different topics are in [`docs/demos/`](docs/demos/) (Korean). **Reproduction status:** a successful file save in a writable Codex environment has not been recorded yet; see [`docs/CODEX-TODO.md`](docs/CODEX-TODO.md).

---

https://github.com/user-attachments/assets/9dff1b4b-2aa1-4adc-8f84-1e53e637f918

## Start with a conversation

Open this repository as a folder in Codex and ask: “Following this repository's AGENTS.md, discuss my new research idea with me and write a proposal draft.” The agent asks only for missing decisions, compares feasible directions, and writes a Markdown draft under the Git-ignored `workspace/` directory after you choose the research questions, data, and method. This does not require installing the ROK CLI. Unverified literature stays explicitly unverified; collection and full workflow approvals come later.

See the [Korean chat demonstrations](examples/chat-proposal/README.md) for two different synthetic topics and the [researcher self-evaluation checklist](docs/CHAT-SELF-EVALUATION.md). You can inspect and score your own draft; no three-person external panel is required. For automated collection, a separate agent review, and researcher finalization, follow the CLI instructions below.
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

## Agent design at a glance

ROK is a multi-agent orchestrator in which **tool-less LLM workers run inside a deterministic harness**.

| Who | Does what |
|---|---|
| Model workers (study, research, review, video) | Write and propose judgments. They have no tools, shell, or approval rights; they receive approved text only and return schema-valid JSON. Codex runs with `--sandbox read-only`, Claude with `--tools ''`. |
| Harness (code) | Literature search, open-access download, PDF/HWP parsing, SHA-256 binding, quote-location checks, state transitions, resume, and limits. ROK fills in hashes and plan sentences so a model never has to copy them. |
| Researcher | Decides at five gates only: scope, collection, revision items, use verification, `finalize`. |

- **Autonomy:** inside a scope approved once (input hashes, search terms, 12 worker calls, paid-API budget 0) it keeps going: collect, draft, independent review, up to two supplementary rounds.
- **Stops:** it halts at every researcher gate, call limit, usage limit, hash mismatch, or missing artifact, and keeps completed work.
- **Evidence:** a model-proposed citation counts only if the quote is on the cited page. In a seeded fault-injection run it rejected all 140 injected faults and none of 40 honest ledgers (a naive substring baseline caught 57% and wrongly rejected 50% of honest ones). Semantic support is not judged automatically.

Details: [agent design](docs/AGENT-DESIGN.md) · [autonomy policy](docs/AUTONOMY.md) · [evaluation](docs/EVALUATION.md#evidence-check-fault-injection-v070). The design and autonomy documents are written in Korean.

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

`npm run verify` runs 104 tests, synthetic APA 7, JQI, and quantitative cases, the evidence fault-injection evaluation (`npm run eval`), the npm package allowlist, and a full-history privacy audit. CI covers Ubuntu and Windows with Node.js 20 and 22. A synthetic case was run end to end with real Claude Code calls and live Crossref/OpenAlex/open-access collection, from exploratory search through review, rework, a revision passing every automated check, and `finalize`; human gates were recorded as a labeled synthetic operator, never as a researcher. A clean Codex CLI run with default limits produced a plan and stopped at the gate. The live KCI server was checked for missing and invalid keys (its reason is shown without the key); a search with a valid key needs the researcher's own KCI key.

## License

MIT for this project's code and documentation. The optional Remotion renderer has its own license. Third-party templates, papers, logos, music, and images belong to their owners. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
