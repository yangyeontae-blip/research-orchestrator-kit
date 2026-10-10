# 클라우드 API 개인정보 보호

`openai_api`와 `anthropic_api`는 선택 기능이다. 기본 설정은 로컬 파일 인계이며 API 키가 없어도 전체 상태 머신을 사용할 수 있다.

- 키는 `OPENAI_API_KEY` 또는 `ANTHROPIC_API_KEY` 환경변수에서만 읽는다.
- PDF, DOCX, HWP, HWPX는 클라우드 전송 대상에서 차단한다.
- 허용된 텍스트 파일마다 경로, 바이트 수, SHA-256, 민감정보 탐지 결과를 호출 전에 표시한다.
- 사용자가 그 호출에 대해 `SEND`를 입력해야만 전송한다. 비대화형 자동 승인 옵션은 없다.
- 로그에는 본문·응답·키를 쓰지 않고 제공자, 모델, 입력 파일 해시, 요청 해시, 사용량, 요청 ID, 시각만 남긴다.
- 자동 탐지는 완전한 개인정보 판별기가 아니다. 탐지 결과가 없어도 사용자가 전송 범위를 검토해야 한다.

OpenAI 어댑터는 [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)의 Structured Outputs를, Anthropic 어댑터는 [Messages API](https://platform.claude.com/docs/en/api/messages/create)의 `output_config.format`을 사용한다.
