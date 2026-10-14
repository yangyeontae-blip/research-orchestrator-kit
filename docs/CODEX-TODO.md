# Codex에서 이어서 할 일

> 2026-10-14 진행: 공개 가능한 가상 사례 2건의 쓰기 가능한 대화 저장을 [재현 기록](CHAT-REPRODUCTION-writable.md)에 남겼다. 해시 결속 가져오기, Codex CLI 재실행 기록, 기존 v0.6.1 릴리스 첨부 확인과 저장소 영상 정리도 완료했다([네이티브 실행 확인](records/NATIVE-RUN-EVIDENCE-2026-10-14.md)). 아래 명령 블록은 당시 작업 요청의 일반화된 예시이며, 현재 상태를 뜻하지 않는다.

이 문서는 Claude가 저장소 안에서 할 수 있는 개선(대화 경로 정리, 저장 확인, 초안 구성 기준, 문헌 처리, 합의 인용, 테스트)을 마친 뒤, **Codex를 직접 실행해야만 할 수 있는 일**을 남겨 둔 목록이다. 각 항목의 명령은 Codex 대화창에 그대로 붙여 넣는다. 항목마다 커밋은 하되 푸시는 사용자가 한다.

시작할 때 쓰기 가능한 모드로 연다.

```powershell
cd <이 저장소를 받은 폴더>
codex --sandbox workspace-write
```

도움말(`codex --help`)로 플래그 이름이 설치된 버전과 같은지 확인한다. 이전 독립 재현([기록](records/CHAT-REPRODUCTION-2026-10-13.md))에서는 쓰기 모드를 지정해도 후속 턴의 쓰기가 막힌 환경이 있었다. 그 경우 권한을 우회하지 말고 실패 원인과 오류 문구를 그대로 기록한다.

## 1. 쓰기 가능한 환경에서 저장 성공 기록 남기기 (가장 중요)

현재 가장 큰 약점이다. 대화 경로로 `.md`가 실제 생성된 기록이 아직 없다.

```text
AGENTS.md에 따라 가상의 연구 주제로 연구계획서 초안 대화를 진행해 줘. 0단계 저장 확인부터 해. 질문에는 내가 직접 답할게. 끝나면 workspace/ 아래 .md가 실제로 생겼는지 확인해서 경로와 크기를 보고하고, 공개 가능한 결과만 docs/CHAT-REPRODUCTION-writable.md에 기록해 줘. 실패했다면 오류 문구를 그대로 적어.
```

성공 기록이 생기면 다음을 함께 고친다.
- `README.md`의 "저장 성공 기록은 아직 없으며" 문장을 실제 기록 링크로 바꾼다.
- `tests/chat-protocol.test.mjs`의 마지막 테스트("README does not claim a successful file save…")를 새 문장에 맞게 고친다. 테스트를 지워서 통과시키지 말고 같은 의미의 검사로 바꾼다.
- `npm run verify`를 통과시킨다.

## 2. 같은 시험을 서로 다른 주제 3개로 반복

한 번의 성공으로는 부족하다. 교육 질적 / 보건 양적 / 혼합 설계 주제 하나씩으로 같은 절차를 돌리고, 각 실행의 질문 수, 저장 성공 여부, 초안 분량(문자 수), 합의하지 않은 내용이 `[제안]`으로 표시됐는지를 `docs/CHAT-REPRODUCTION-writable.md`에 표로 남긴다.

```text
docs/CHAT-REPRODUCTION-writable.md의 방식으로 주제를 바꿔 두 번 더 실행해 줘: (1) 학교 보건교사의 직무 스트레스 설문 연구, (2) 중학생 독서토론 수업 효과의 혼합 연구. 각 실행의 질문 수, 저장 성공 여부, 초안 문자 수, [제안] 표시 여부를 한 표로 기록하고 커밋만 해.
```

## 3. 대화 경로와 심화 모드 잇기 (src 변경)

대화로 저장한 `proposal-draft.md`를 `rok` 심화 모드의 수집 승인과 이어 주는 코드가 없다. 지금은 두 경로가 따로여서 대화 경로의 합의 게이트가 텍스트 규칙에 머문다.

```text
src/engine.mjs, src/cli.mjs, schemas/를 읽고 설계안부터 먼저 보여 줘: workspace/<주제>/proposal-draft.md를 `rok`의 계획서로 가져와(import) 그 파일의 SHA-256에 수집 승인이 묶이게 하는 방법. 내가 설계안을 승인하면 구현하고, 기존 테스트를 깨지 않게 새 테스트를 추가하고 npm run verify를 통과시켜. AGENTS.md 4단계 끝에 이어서 실행할 명령을 안내하는 문구도 추가해. 커밋만 하고 푸시는 하지 마.
```

## 4. `rok`의 Codex 어댑터를 실제로 돌려 보기

`src/execution.mjs`의 `runWorkflow`가 `codex exec --sandbox read-only --ephemeral`로 도구 없는 워커를 호출한다(`src/adapters/codex.mjs`는 `rok next`의 수동 인계 메시지만 만든다). README의 "verified native runs" 주장에 대응하는 실행 기록을 확인하고, 없으면 만든다.

```text
src/execution.mjs, src/adapters/codex.mjs, docs/AGENT-DESIGN.md를 읽고, README와 CHANGELOG의 "verified native runs", "real end-to-end runs" 표현이 어떤 실행 기록(파일)에 근거하는지 찾아 표로 정리해 줘. 근거 파일이 없는 표현이 있으면 어느 줄인지 알려 줘. 합성 예제(examples/synthetic)로 `rok run`을 한 번 실제로 돌리고 결과를 docs/에 기록해. 커밋만 해.
```

## 5. 저장소 무게 줄이기 (GitHub 로그인 필요, 선택)

`docs/media` 16MB, `docs/video` 4.5MB, `.git` 49MB. mp4를 릴리스 첨부로 옮기면 클론이 빨라진다. 영상 자체를 지우자는 제안이 아니다. 업로드와 푸시는 사용자가 직접 한다.

```text
docs/media의 mp4를 저장소에서 빼고 GitHub 릴리스 첨부로 옮기는 절차를 정리해 줘. README의 영상 링크를 릴리스 주소로 바꾸는 수정안만 만들어 두고, 실제 업로드와 푸시는 하지 마. scripts/check-package.mjs의 패키지 허용 목록에 미치는 영향도 확인해 줘.
```

## 6. 릴리스 (위 1~4가 끝난 뒤)

대화 경로 개편은 사용자에게 보이는 변경이므로 패치 버전을 올린다. 공개된 태그는 옮기지 않는다.

```text
CHANGELOG.md의 Unreleased를 0.7.1로 정리하고 package.json 버전과 README 배지를 맞춰 줘. npm run verify를 통과시키고 새 커밋으로 남겨. 푸시와 태그는 하지 마.
```

## 이미 끝난 일 (Claude, 이 커밋)
- 로컬 `main`과 `origin/main`을 합치고 `AGENTS.md`의 중복된 대화 경로 절을 하나로 정리했다. 저장 위치는 `workspace/<주제요약>/proposal-draft.md`로 통일했다.
- 0단계(저장 가능 확인, 모델 사용 불가 시 계속 진행), 절별 최소 내용과 분량 기준, 문헌 처리(검색 불가 시 탐색 계획), 합의 사항의 사용자 문장 인용, 자체 점검 8항으로 확장했다.
- `tests/chat-protocol.test.mjs`를 추가해 이 구조가 되돌아가지 않게 했다.
- 게이트의 해시 바인딩이 코드에 실제로 있음을 `src/engine.mjs`에서 확인했다(예: `Artifact hash mismatch`, 수집·반영·영상 승인의 해시 기록). 테스트 통과는 `npm test`로 확인했다(새 테스트 4건 포함).
