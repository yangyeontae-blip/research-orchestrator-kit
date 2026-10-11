# Claude adapter

공통 규칙은 `AGENTS.md`와 해당 역할의 `prompts/*.md`를 따른다.

Claude 파일 연결은 API나 특정 대화 ID를 코드에 고정하지 않는다. `config.local.json`에서 역할의 provider를 `claude`로 정하고 inbox 경로를 지정하면, `claim`이 `.research-work/` 아래에 요청 JSON을 만든다. 선택형 `anthropic_api`는 API 키를 환경변수에서만 읽고, 호출마다 전송 파일·크기·민감정보 검사 결과를 보여준 뒤 사람의 `SEND` 확인을 요구한다. PDF·DOCX·HWP·HWPX는 클라우드로 보내지 않는다.

요청 JSON의 입력 파일과 SHA-256을 확인하고 작업한다. 문헌 역할은 합법적으로 보유한 HWP/HWPX만 로컬 `kordoc` 결과로 인계하며, 연구 역할은 승인 원본 Markdown에서만 HWPX를 생성한다. 결과는 `schemas/receipt.schema.json`에 맞춰 작성한다. `video` 역할도 같은 규칙을 따르며 승인된 계획서·스토리보드·출처 지도 해시를 확인한다. 다음 단계의 enqueue·승인·재시도는 기획팀장이 수행한다.

인계 설명에는 목표·사용자 결정·입력 버전과 해시·미해결 사항·다음 행동·완료 조건을 남긴다. receipt의 성공 상태와 별도로 실제 사용 검증 결과를 기록하고, 확인하지 않은 문서 렌더링·영상 재생·연구 근거를 완료로 표현하지 않는다.
