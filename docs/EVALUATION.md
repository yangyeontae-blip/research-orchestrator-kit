# Evaluation and reproducibility

## Verification command

```bash
npm run verify
```

The command runs six independent checks in order:

1. The complete Node.js test suite.
2. A privacy and release audit of publishable files, every reachable historical Git blob, and commit identities.
3. The v0.1 deterministic synthetic lifecycle.
4. Three v0.2 synthetic cases: APA 7 autoethnography, JQI interview, and generic quantitative research.
5. The evidence-check fault-injection evaluation (below).
6. An npm package dry run checked against the public allowlist.

## Requirement-to-evidence matrix

| Requirement | Evidence |
|---|---|
| Duplicate request prevention | engine test reuses an identical request and rejects changed content under the same ID |
| Exclusive role claim | engine test rejects a second claimant |
| Plan-bound collection approval | test mutates the approved plan and observes a hash rejection |
| Report-bound revision approval | tests reject missing confirmation, empty items, and a changed report |
| Partial-failure recovery | test preserves a collection report, retries parsing, and creates one review task |
| New approval for a revised plan | lifecycle test ends at a fresh collection gate with cleared approvals |
| APA 7 option | profile test separates official style rules from toolkit proposal sections; engine test requires support artifacts and completed hard checks |
| JQI gate | tests require profile artifacts and a score strictly greater than 9.0 |
| Portable adapters | tests cover Codex message output and Claude inbox containment |
| Public-release privacy | tests detect local paths, thread IDs, personal contacts, secrets, and non-allowlisted commit identities |
| Third-party material boundary | profile tests exclude APA manuals/sample papers and the JQI template while preserving official source links |
| Literature/PDF reliability | tests cover deduplication, rate-limit retry, malformed/scanned/mismatched PDFs, page labels, and partial reuse |
| Evidence traceability | quality tests require an explicit verification state for every core claim |
| Video gate | tests bind rendering to plan, storyboard, and source-map hashes and invalidate stale approval |
| Cloud privacy | mock API tests require confirmation, reject source documents, and keep content out of logs |
| DOCX correspondence | export tests inspect OOXML structure and document-manifest hashes |

## Cross-platform matrix

`.github/workflows/verify.yml` runs the same release verification on:

- Ubuntu with Node.js 20
- Ubuntu with Node.js 22
- Windows with Node.js 20
- Windows with Node.js 22

The application uses `path.resolve`, relative artifact bindings, and Node filesystem APIs. No source file contains a hard-coded user directory.

## Synthetic scenario

The example uses invented institutions, authors, and research materials. It demonstrates:

1. a study record;
2. a first research plan;
3. explicit collection approval;
4. collection and parsed notes;
5. an evidence review;
6. approval of selected revision items;
7. a revised plan that stops at a new collection gate.

The example is a workflow evaluation. It is not evidence of research quality, retrieval accuracy, or empirical validity.

## Evidence-check fault injection (v0.7.0)

`npm run eval` (also step 5 of `npm run verify`) measures the one component that decides whether a model-proposed citation counts as support: the mechanical quote-location check (`src/evidence.mjs` `verifyEvidence`, plus `correctPages` in `src/evidence-bridge.mjs`). No model is called. A seeded generator (`--seed`, default 20261013) builds synthetic parsed PDFs and claim ledgers, injects known citation faults, and records whether each ledger is accepted. Two baselines are scored on the same cases:

- **B0 no check** – accept the ledger as written, as an unguarded LLM pipeline would.
- **B1 naive match** – accept when the quote is an exact substring of the cited page, with no whitespace/hyphenation normalization and no hash, plan, or relation checks.

Result with 20 ledgers per case (9 cases, 180 ledgers; 40 honest, 140 faulty):

| case | ledger | ROK accepts | B0 accepts | B1 accepts |
|---|---|---|---|---|
| valid_exact | honest | 20/20 | 20/20 | 20/20 |
| valid_linebreak (PDF hyphenation and line breaks) | honest | 20/20 | 20/20 | 0/20 |
| fabricated_quote | faulty | 0/20 | 20/20 | 0/20 |
| altered_word (one word changed) | faulty | 0/20 | 20/20 | 0/20 |
| wrong_page (quote exists on another page) | faulty | 0/20 | 20/20 | 0/20 |
| hash_mismatch (parsed text does not belong to the cited document) | faulty | 0/20 | 20/20 | 20/20 |
| claim_not_in_plan | faulty | 0/20 | 20/20 | 20/20 |
| empty_quote | faulty | 0/20 | 20/20 | 0/20 |
| bad_relation (relation not support/contradiction/context) | faulty | 0/20 | 20/20 | 20/20 |

| metric | ROK | B0 no check | B1 naive match |
|---|---|---|---|
| fault detection (140 faulty) | 100% | 0% | 57% |
| false rejection of honest ledgers (40) | 0% | 0% | 50% |
| `wrong_page` repaired to the correct page by `correctPages` | 100% | – | – |

How to read this honestly:

- The faults are the ones the check was built to catch, so 100% detection shows the check works as specified and guards against regressions (the script exits non-zero if any fault is accepted or any honest ledger rejected). It does **not** estimate how often a real model's citations are wrong, and it says nothing about semantic support: a verbatim quote can still fail to support its claim (`semantic_verified` stays `false`).
- B1 is a deliberately simple baseline. It shows why the normalization and the hash/plan/relation checks exist, not that no better checker could be built.
- Everything here is synthetic and self-authored. Live model behavior is documented separately in [chat-execution.md](chat-execution.md) (two real end-to-end runs; in the recorded review, quotes that failed location checks were reported and not counted).

## End-user verification

The automated suite checks files, schemas, hashes, and synthetic flows. Final completion is recorded separately after exercising the delivered artifact:

| Artifact | End-user check |
|---|---|
| Research plan | Human review of citation evidence and research question–data–analysis alignment |
| DOCX/HWPX | Open the export; inspect Korean text, tables, page breaks, and correspondence with the approved Markdown |
| Video | At the published URL, click play, seek through the video, and hear its audio |
| README or web page | Open the public URL and use its links and key controls |

If the check cannot be performed, report `generated; end-user verification pending` with the reason. A passing CI badge alone is not an end-user verification result.

## Remaining evaluation gaps

- No distributed-filesystem concurrency test.
- Completion is the researcher's decision (`finalize`), recorded against the current file hashes; see [RESEARCHER-JUDGMENT.md](RESEARCHER-JUDGMENT.md). No external score is used as a release or completion criterion.
- No performance benchmark because the state files are intentionally small and local.
- Live API smoke tests remain opt-in; default CI uses mock servers and makes no billable calls.
