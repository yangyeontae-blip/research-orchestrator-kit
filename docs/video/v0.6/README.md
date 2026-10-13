# v0.6 소개 영상 소스

114초, 1920×1080, 30fps, 한국어 나레이션·자막, 합성 음악·효과음. "연구자는 판단하고, 에이전트는 실행한다"를 장면마다 실제 기능으로 보여줍니다. 화면 속 파일명·해시·건수·주장은 모두 합성 예시입니다.

| # | 장면 | 보여주는 기능 |
|---|---|---|
| 1 | Relay | 채팅 사이로 파일을 옮기고 버전을 맞추고 멈춘 작업을 되살리는 시간 |
| 2 | v0.6 | `run` · `resume` · `stop` · `doctor` · `blueprint` |
| 3 | Run scope | 한 번의 실행 범위 승인: 목적·형식, 보낼 파일과 해시, 검색어, 도구, 상한, 유료 API 0원 |
| 4 | Execution | 탐색 수집 → 원문 확보 → 계획서 초안(Claude) → 품질 보고서·DOCX → 블루프린트 → 판단 지점에서 정지 |
| 5 | Literature | Crossref·OpenAlex·KCI·RIS/BibTeX·Unpaywall, 접근 불가·OCR 필요·문헌 불일치는 성공으로 치지 않음 |
| 6 | Evidence | 주장 → 문헌 → 파일 해시 → 쪽·인용 → 관계, 인용 불일치 표시 |
| 7 | Blueprint | **실제 블루프린트 렌더러 출력** (합성 APA 7 계획서, `rok preview` 화면) |
| 8 | Recovery | 사용량 한도 도달 → 완료 산출물 보존 → `rok resume`, 유료 API 전환 없음 |
| 9 | Judgment | `finalize`에 필요한 기록과 연구자 확정, 외부 점수는 완료 기준이 아님 |
| 10 | Principle | 판단은 연구자에게, 실행은 에이전트에게 |

## 다시 만들기

```bash
cd docs/video/v0.6/remotion
npm ci
npm run audio      # 나레이션 · 타이밍 · 자막 · 합성 음악 · 효과음
npm run render     # rok-v0.6-raw.mp4 (Git 제외)
npm run master     # 음량 정규화 → research-orchestrator-kit-v0.6.1.mp4
npm run poster
```

`npm run audio`는 `narration.json`의 대본으로 나레이션을 만들고, 음성 길이에 맞춰 장면 길이와 `captions.srt`를 정합니다. 음성은 Microsoft Edge TTS를 먼저 시도하고, 응답하지 않으면 Google TTS(`pip install gTTS`, 실행 파일 위치는 `GTTS_CLI`)를 씁니다. 둘 다 안 되면 자막과 음악만으로 장면 길이를 정합니다. 이번 버전은 Edge TTS가 403으로 응답해 Google TTS로 만들었습니다. 영어 고유명사는 `speech` 필드에 한글 발음으로 적었습니다.

`remotion/public/blueprint-clip.mp4`는 `examples/synthetic-v2/apa7-autoethnography/plan.md`로 `rok blueprint`와 블루프린트 렌더러를 실행한 결과에서 연구문제·개념(미확인)·질문→자료→분석 장면을 잘라낸 것입니다.
