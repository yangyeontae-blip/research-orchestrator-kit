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
`study → plan → collection approval → literature → review → revision approval → revise`

영상은 현재 계획서가 있을 때만 별도 가지로 시작한다.
`plan → user video request → storyboard/source-map → video approval → render/QA`

- 사용자의 직접 명령으로만 시작한다. 예약·heartbeat를 만들지 않는다.
- 수집 승인은 정확한 계획서 SHA-256에 묶는다.
- 반영 승인은 계획서·검토 보고서 SHA-256과 승인 항목에 묶는다.
- 영상 승인은 계획서·스토리보드·출처 지도의 SHA-256에 묶는다.
- 파일이 바뀌면 승인을 승계하지 않는다.
- 담당 에이전트는 receipt만 제출하고 다음 작업을 직접 만들지 않는다.
- 부분 실패는 성공 산출물을 보존하고 같은 작업을 `retry`한다.

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

## CLI
- `rok new`
- `rok next`
- `rok validate`
- `rok export`
- `rok literature search --query "..."`
- `rok literature ingest <pdf|hwp|hwpx>`
- `rok video request`
- `rok init --profile generic|apa7|jqi`
- `node src/cli.mjs enqueue <request.json>`
- `node src/cli.mjs claim <task-id> --agent <name>`
- `node src/cli.mjs complete <receipt.json>`
- `rok approve <collection|revision|video> <approval.json>`
- `node src/cli.mjs status`
- `node src/cli.mjs retry <task-id>`
