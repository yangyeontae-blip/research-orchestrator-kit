# 채팅 기반 실행 · 개발 프리뷰

연구자는 기획팀장 채팅에서 목적·범위·승인을 결정합니다. 호스트 에이전트가 `rok bridge`의 JSONL 요청을 작성하며, 연구자가 JSON을 직접 작성할 필요는 없습니다. 이 연결은 로컬 stdio 프로토콜이며 MCP 서버를 가장하지 않습니다. 호스트 설치·도구 연결은 필요합니다.

## 설정

1. 저장소 의존성을 `npm ci`로 설치합니다.
2. Codex CLI 또는 Claude Code를 설치하고 자체 로그인 명령으로 인증합니다. ROK는 인증정보를 복사하거나 저장하지 않습니다.
3. `rok doctor`로 설치 여부를 확인합니다. 인증 성공·구독 잔여량을 보장하는 검사는 아닙니다.
4. `rok bridge --root <작업폴더>`를 호스트 도구에 연결합니다. 실행 범위 확인 후 `authorize`, `run`을 호출합니다.

각 줄은 `{ "id": 1, "method": "status", "params": {} }`와 같은 요청입니다. 응답은 동일 id와 result 또는 error를 가집니다. root는 시작할 때 고정되며 요청으로 변경할 수 없습니다. 한 연결은 순차 처리합니다. 실행 중 중단은 별도 `rok stop`으로 요청합니다.

## 호스트 계약

- `new`: params.answers에 기존 마법사 입력을 전달합니다. 연구아이디어·방법·제출처를 임의로 만들어 넣지 않습니다.
- `authorize`: params.proposal에 workflow_id, provider(codex_cli 또는 claude_cli), inputs(path/sha256), queries(익명화된 검색어 배열), exploratory_search, limits를 보냅니다. params.confirmation은 실제 사용자 응답 text와 출처 source입니다. 기본 제한은 후보 50, 원문 15, 동시 상한 2, 보완 2회, AI 호출 12회, API 예산 0입니다. 현재 실행기는 안전한 순차 실행이며 동시 상한을 넘지 않습니다.
- `run` / `resume` / `stop` / `status` / `doctor`: 직접 실행·재개·중단·상태 확인입니다. 스케줄러는 없습니다.
- `approve`: kind(collection/revision/video), 기존 승인 객체 approval, 실제 confirmation을 전달합니다. 해시 관문은 그대로 적용됩니다.
- `verify-use`: task_id, 기존 specification, 실제 confirmation을 전달합니다. 사람이 실제로 확인하지 않은 항목은 기록하지 않습니다.
- `collect-more` / `finalize` / `reopen`: 기존 request와 실제 confirmation을 전달합니다. 보완 횟수 상한 뒤에는 범위 변경을 논의합니다.
- `blueprint`: plan 경로, 선택적으로 previous 블루프린트 경로를 전달합니다.
- `render`: blueprint 파일/해시와 confirmation(text/source/blueprint_sha256)을 전달합니다. 기본은 무음 자막입니다.
- `evidence`: plan 바인딩과 evidence-companion 스키마의 ledger를 전달합니다.

승인 전 호스트는 제공자, 입력 파일과 해시, 검색식, 파싱 본문 전송 여부, 민감정보 탐지, 제한을 사용자에게 보여줘야 합니다. 확인 문구는 호스트가 실제 대화에서 가져옵니다. 이 모델은 신뢰하는 로컬 호스트를 전제하며 사용자 본인 인증을 독립적으로 증명하지 않습니다. 작업자는 승인 호출을 하지 않습니다.

## 실행과 한계

기존 수동·파일 인계·API 어댑터는 유지합니다. 새로운 네이티브 실행기는 승인된 텍스트만 프롬프트로 구성하고 원본 PDF/HWP/HWPX를 전송하지 않습니다. 네이티브 CLI 자체의 클라우드 환경·로컬 읽기 권한까지 격리하는 컨테이너 보안 경계는 아닙니다. 비밀 자료에는 별도의 OS 격리와 호스트 정책이 필요합니다.

기존 CLI 로그인에 API 인증을 설정했다면 제공자 과금이 발생할 수 있습니다. ROK는 계정의 구독/과금 유형을 판정하지 않습니다. 구독 로그인을 직접 확인해야 하며, ROK가 다른 유료 API로 자동 전환하지는 않습니다.

작성과 검토는 새 세션으로 분리합니다. 실패 재개는 완료 파일을 보존하면서 실패 작업을 새 컨텍스트에서 실행합니다. 모델 내부 대화 세션을 무조건 재사용하지 않습니다. 계획서 생성 후 DOCX·자동 품질보고서·출처가 연결된 블루프린트를 생성하고 실제 검토 관문에서 멈춥니다. 자동 품질점수는 학술적 타당성 평가가 아닙니다.

문헌은 Crossref/OpenAlex와 선택적 Unpaywall 이메일 설정을 사용합니다. 실행 범위에서 kci를 켜고 환경변수 KCI_API_KEY를 설정하면 공식 KCI 제목 검색도 요청합니다. 키가 없거나 API가 실패하면 누락을 기록하고 다른 제공자 결과를 보존합니다. 실제 KCI 계정 호출은 별도 검증이 필요합니다. import-bibliography(file)로 RIS와 기본 BibTeX를 가져올 수 있으며 매크로·복잡한 확장 문법은 명시적으로 거절합니다. 무제한 수집이나 기관 로그인 우회는 없습니다.

현재 video_render 작업은 자동 완료하지 않고 별도 렌더링을 요청합니다. 프리뷰 렌더링 매니페스트는 기존 최종 영상 인계 검증을 대체하지 않습니다.

## 영상

소스 체크아웃에서 `npm ci --prefix docs/video/v0.5/remotion`으로 선택형 렌더러를 설치합니다. Remotion은 ROK MIT와 별도 라이선스입니다: https://www.remotion.dev/docs/license/pricing

`rok blueprint --plan <계획서.md>`는 출처 행을 보존하는 초안을 생성합니다. `--previous`는 이전 설계와 문구 변경을 비교합니다. 변경 이유를 만들어내지 않습니다. 72초·1080p 자막 영상은 검토된 블루프린트 해시를 승인한 뒤 bridge render로 생성합니다. `rok preview <영상.mp4>`는 로컬 주소에서 클릭 재생·탐색을 지원하며 다운로드는 별도입니다. 사용 권한이 있는 로컬 음성 파일(mp3/wav/m4a)은 render의 audio 바인딩과 confirmation.audio_sha256으로 별도 승인해 삽입할 수 있습니다. 음성 자동 생성은 이 프리뷰에서 지원하지 않습니다.

## 검증 수준

자동 테스트의 AI 응답은 합성 mock입니다. Windows에서 ChatGPT로 로그인한 실제 Codex CLI의 합성 공부 작업 1건과 72초 1080p 무음 영상 생성·전체 디코딩을 추가 확인했습니다. 로컬 브라우저에서 클릭 재생(18초), 구간 이동(48초), 일시정지와 한글 장면을 확인했습니다. Claude·KCI 실제 계정 호출, 모든 연구 단계의 실제 모델 완주, 외부 사용자 평가는 아직 확인하지 않았습니다. 실제 Codex/Claude 계정으로 전 과정을 돌린 사용자 평가는 별도입니다. 동영상 전체 디코딩 검사, 영상 시각검토, 실제 클릭 재생은 각각 구분합니다. 외부 연구자 3인의 평가·9.5점 달성을 주장하지 않습니다.

KCI 명세 확인: 2026-10-12, https://www.kci.go.kr/kciportal/po/openapi/openDataView.kci?datasetBean.dtstSeqNo=1
