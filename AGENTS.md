# Research Orchestrator Kit

## 목적
- 이 저장소는 공부에서 연구계획서 보완까지 파일과 해시로 인계하는 공개용 도구다.
- 사용자 지시와 선택한 프로필을 우선한다.
- 실제 경험, 연구 결과, 인용, 쪽수, 문헌 확보 상태를 창작하지 않는다.

## 다섯 역할
- `orchestrator`: 상태 확인, 작업 전달, 승인 관문, 실패 재개.
- `study`: 공부 대화, 기록, 연구 연결 제안.
- `research`: 계획서, 근거 검토, 승인된 보완.
- `literature`: 검색, 중복 검사, 수집, PDF·HWP·HWPX 파싱.
- `video`: 사용자 요청 뒤 스토리보드·출처 지도 작성, 승인된 구성의 영상 렌더링과 기술 검수.

## 흐름
`study → plan → collection approval → literature → review → revision approval → revise → researcher finalization`

검토에서 근거 공백이 나오면 `collect-more`로 공백·검토 보고서를 묶어 새 수집 승인을 요청하고, 기존 문헌을 보존한 채 보완 수집 뒤 전체 근거를 다시 검토한다. 보완본은 자동으로 최종본이 되지 않는다.

영상은 현재 계획서가 있을 때만 별도 가지로 시작한다.
`plan → user video request → storyboard/source-map → video approval → render/QA`

- 사용자의 직접 명령으로만 시작한다. 예약·heartbeat를 만들지 않는다.
- 수집 승인은 정확한 계획서 SHA-256에 묶는다.
- 반영 승인은 계획서·검토 보고서 SHA-256과 승인 항목에 묶는다.
- 최종 확정은 검토된 보완본, 품질 보고서, 생성 문서와 사람의 실사용 확인·남은 한계에 묶는다. 원본이 바뀌면 확정은 유효하지 않다.
- 영상 승인은 계획서·스토리보드·출처 지도의 SHA-256에 묶는다.
- 파일이 바뀌면 승인을 승계하지 않는다.
- 담당 에이전트는 receipt만 제출하고 다음 작업을 직접 만들지 않는다.
- 부분 실패는 성공 산출물을 보존하고 같은 작업을 `retry`한다.
- 모든 인계에는 목표, 이미 내린 사용자 결정, 입력 파일·버전·해시, 미해결 사항, 다음 행동, 완료 조건을 적는다. 확인되지 않은 판단은 비워 두거나 미확인으로 표시한다.
- 완료 보고는 `생성`, `자동검사 통과`, `실제 사용 검증`을 구분한다. 마지막 검증을 수행하지 않았으면 완료라고 단정하지 않는다.

## 파일 규칙
- 입력과 출력은 프로젝트 루트 안에 둔다.
- 개인 자료와 내려받은 문헌은 Git에서 제외되는 `workspace/` 또는 `downloads/`에 둔다.
- 실행 상태는 `.research-work/`에만 저장한다.
- `config.local.json`에 실제 연결값을 쓰고 커밋하지 않는다.
- 기존 산출물을 덮어쓰지 말고 새 버전을 만든다.

## 검증
- 주장과 서지는 원출처에서 확인한다.
- 원문을 읽지 않았으면 초록 또는 메타데이터 확인으로 표시한다.
- 파싱 결과는 원문 검증과 다르다.
- 사용자 소유·사용 권한이 확인된 HWP/HWPX만 로컬 `kordoc`으로 파싱한다. 자동 쪽수나 인쇄 레이아웃 확인을 창작하지 않는다.
- Markdown은 계획서의 승인 원본이며 DOCX·HWPX는 파생 산출물이다. HWPX 생성 뒤에는 파일 해시와 로컬 재파싱 결과를 기록하고, 시각 검증 여부를 별도로 표시한다.
- 영상은 승인된 연구 흐름만 시각화하며 연구 결과·참여자·인용을 창작하지 않는다.
- 학회 양식·논문·로고 등 제3자 파일은 명시적인 재배포 허락 없이 저장소에 넣지 않는다.
- APA 7 프로필은 공식 스타일 규칙과 도구가 제안하는 계획서 구조를 구분하며 대학·학과·교수·제출처 지침을 우선한다.
- APA 매뉴얼·견본 논문·로고·공식 교육자료는 명시적인 재배포 허락 없이 저장소에 넣지 않는다.
- JQI 프로필은 공식 규정의 사실적 요건을 독립적으로 요약한 것이며 학회 제휴나 승인을 뜻하지 않는다.
- 공개 전 `npm run verify`로 테스트·전체 Git 이력 감사·합성 흐름을 모두 실행한다.
- 실제 사용 검증은 산출물에 맞춰 기록한다. 계획서는 인용·방법 정합성, DOCX·HWPX는 열림·레이아웃·원본 대응, 영상은 배포 주소의 클릭 재생·탐색·소리, README·웹페이지는 공개 주소의 링크와 핵심 동작을 확인한다.
- 영상과 HWPX는 사용자가 요청할 때 실행하는 선택 기능이다. 해당 기능의 실패를 연구 본 흐름 전체의 완료로 보고하지 않는다.
- 일반 수정은 새 커밋으로 남긴다. 공개된 릴리스 태그를 옮기지 않고 수정 배포에는 새 패치 버전을 쓴다. 배포 후 공개 주소에서 실제 사용을 확인하고 실패하면 이전 정상 버전으로 복구한다.

## CLI
- `rok new`
- `rok next`
- `rok finish <task-id>`
- `rok validate`
- `rok export`
- `rok literature search --query "..."`
- `rok literature ingest <pdf|hwp|hwpx>`
- `rok collect-more --gaps "..."`
- `rok finalize --document docx|hwpx`
- `rok reopen --reason "..."`
- `rok video request`
- `rok init --profile generic|apa7|jqi`
- `node src/cli.mjs enqueue <request.json>`
- `node src/cli.mjs claim <task-id> --agent <name>`
- `node src/cli.mjs complete <receipt.json>`
- `rok verify-use <task-id> [verification.json]`
- `rok approve <collection|revision|video> <approval.json>`
- `node src/cli.mjs status`
- `node src/cli.mjs retry <task-id>`

## 범위 승인 실행 프리뷰
- `docs/chat-execution.md`의 호스트 계약을 따른다. 실제 사용자 응답·출처·파일 해시로 실행 범위를 승인하며 작업자가 승인을 만들어내지 않는다.
- `run/resume/stop/doctor/blueprint`는 직접 요청할 때만 실행한다. heartbeat와 자동 유료 API 전환은 금지한다.
- 작성과 검토는 새 컨텍스트로 분리한다. 파싱 위치 대조와 AI 의미 판단, 사람 검토를 구분한다.
- 범위 승인으로 계획서 버전 승인이나 실제 사용 검증을 대신하지 않는다. 영상 프리뷰 생성은 최종 영상 작업 완료가 아니다.
