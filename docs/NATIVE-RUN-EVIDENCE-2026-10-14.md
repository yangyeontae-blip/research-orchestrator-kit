# 네이티브 실행 주장과 근거 확인 (2026-10-14)

`src/adapters/codex.mjs`는 `rok next`의 수동 인계 메시지를 만든다. `codex exec --sandbox read-only --ephemeral` 실제 호출은 `src/execution.mjs`의 `runWorkflow`가 수행한다. 두 경로를 같은 실행으로 계산하지 않는다.

| 공개 표현 | 위치 | 저장소에서 확인한 근거 | 판정 |
|---|---|---|---|
| Claude Code 실제 모델로 두 차례 전 과정 실행 | `README.md` 검증 절, `README.en.md` 검증 절, `CHANGELOG.md` 0.6.1 | `docs/chat-execution.md`의 단계·수치 서술 | 서술 기록은 있으나 원본 실행 상태·이벤트 로그는 Git 추적 파일에서 확인하지 못함. 전 과정이 독립 재현되었다는 뜻으로 확대하지 않음 |
| Codex CLI로 계획서 생성 후 확인 관문에서 정지 | `README.md` 검증 절, `README.en.md` 검증 절, `CHANGELOG.md` 0.6.2 | `docs/chat-execution.md`의 129초 재개, 172초 새 프로젝트 서술 | 서술 기록은 있으나 해당 실행의 원본 상태·이벤트 로그는 Git 추적 파일에서 확인하지 못함 |
| 독립 Codex 채팅 대화의 파일 저장 | `docs/CHAT-REPRODUCTION-2026-10-13.md` | 파일 저장 실패의 오류와 대화 관찰 기록 | 실패로 명확히 기록됨 |

이번 합성 실행은 실제 연구자 자료를 쓰지 않는다. 입력은 `workspace/codex-native-reproduction/answers.json`의 가상 교사학습공동체 주제이고, `rok new`로 생성한 입력 파일의 SHA-256은 `e7bb11131f4b489d9870ca0282425f1540e08c2b51abdf621b6ee93bb562486b`이다. 사용자의 이번 요청을 실행 범위의 출처로 기록했고, 제공자는 `codex_cli`, 검색어는 없음, 공개 원문 수집은 꺼짐, 워커 호출 상한은 2회, 유료 API 예산은 0원으로 제한했다. 이는 연구자의 수집 승인이나 연구 타당도 확인을 대신하지 않는다.

첫 `rok run`은 샌드박스에서 Codex CLI가 사용자 프로필의 상태 DB를 열지 못해 실패했다. 오류의 핵심 문구는 `failed to open state db ... unable to open database file`이다. 이어서 상태 DB 접근이 허용된 실행으로 `rok resume`을 시도했다.

두 번째 호출에서 실제 Codex CLI가 구조화된 응답을 반환했고, ROK가 계획서와 연구설계 JSON 등 4개 파일을 저장했다. `run-events.jsonl`의 해당 행은 제공자 `codex_cli`, 단계 `plan`, 상태 `completed`, 위 입력 해시, 네 출력 해시를 기록한다. 계획서 파일은 28,905바이트·12,733자, SHA-256 `f79abb5e9d2075b5c214ff7e7285ddac3c5ba9030bef433ef7924321709f7648`이었다. 상태는 `plan_use_verification`에서 멈췄다. 실행 명령의 최종 출력은 호출 상한 2회에 도달했다는 `limit_reached`였으며, 이 값만 보고 계획서 생성 실패라고 판정하지 않는다.

배포 뒤 공개 [영상 플레이어](https://yangyeontae-blip.github.io/research-orchestrator-kit/video/player/)를 브라우저에서 열어 재생 버튼을 눌렀다. 화면의 재생 위치가 0:02/1:54로 움직이고 자막이 표시되는 것을 확인했다. 탐색 막대를 누른 뒤 0:57/1:54 화면으로 이동하는 것도 확인했다. 브라우저 화면만으로 실제 음량 청취까지 확인했다고 주장하지 않는다. 플레이어의 MP4 주소는 v0.6.1 릴리스 첨부이며, GitHub가 표시한 파일 크기 15,839,866바이트와 SHA-256 `e7e4e37ff229043a76e0e1c0f132eda95e7ac5403df74872d777fd615856b42f`가 로컬 원본과 일치했다. 패키지 허용목록은 `.mp4`를 제외하므로 `scripts/check-package.mjs`의 허용 목록은 바꾸지 않았다.

자동 품질 보고서는 점수 6.3, `draft_checks_passed: false`였다. 합성 입력에 마감일을 넣지 않아 실행 가능성 검사가 실패했다. 증거 상태와 참고문헌 검사는 집중 수집 전 초안에 해당하므로 여기서 실제 근거 검증 성공을 주장하지 않는다. 사람의 계획서 확인, 수집 승인, 독립 검토, 최종 확정은 수행하지 않았다. 원본 상태와 출력은 Git 제외 대상인 `workspace/codex-native-reproduction/`에 보관하며, 공개 저장소에는 이 요약과 해시만 남긴다.
