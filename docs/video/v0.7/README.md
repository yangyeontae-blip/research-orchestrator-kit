# v0.7 소개 영상 소스

122초, 1920×1080, 30fps, 한국어 나레이션·자막, 합성 음악·효과음. 이 저장소의 `AGENTS.md`가 주제에 매이지 않는 연구계획서 에이전트라는 점을, Codex에서 부른 뒤 질문 → 방향 토론 → 동의 → 초안 → 자체 점검으로 이어지는 순서대로 보여 줍니다.

| # | 장면 | 보여주는 것 | 화면 값의 출처 |
|---|---|---|---|
| 1 | Topics | 주제마다 새 지침 대신 하나의 범용 `AGENTS.md` | 주제 이름은 예시 |
| 2 | v0.7 | 제목, AGENTS.md · Codex 대화 · proposal-draft.md · rok(선택) | — |
| 3 | Invoke | 한 문장 호출, 저장 가능 확인, 이유를 단 질문 3개 | 사용자 답변 인용은 공개 기록, 질문 문구는 재구성 |
| 4 | Discuss | 방향 2~3안 비교와 연구자 선택, 추천은 제안으로 기록 | A안·“A 추천안 선택”은 공개 기록, B·C안은 비교를 위해 재구성 |
| 5 | Agree | 연구문제–자료–분석 대응 점검, 명시적 동의, 부록 1 인용 | 초안(`6f265a81…`)의 대응표와 부록 1에서 발췌 |
| 6 | Draft | 저장 경로·크기·해시·글자 수, 8개 자체 점검 | [저장 기록](../../CHAT-REPRODUCTION-writable.md)의 실제 값 |
| 7 | Honesty | 지어낸 인용 대신 `[미확인]`, 합의 안 한 세부는 `[제안]`, “확인된 문헌 없음” | `(○○, 2021)`은 막아야 할 예를 보여 주는 가상 표기, 나머지 문장은 초안에서 발췌 |
| 8 | Two topics | 같은 지침으로 양적(보건교사 직무 스트레스)·혼합(중학생 독서토론) 사례 | [저장 기록](../../CHAT-REPRODUCTION-writable.md)의 실제 값 |
| 9 | Deep mode | `import-plan` → `validate` → 사람의 확인·승인 → 수집·검토 → `finalize`, 인용 위치 대조 평가 | [평가](../../EVALUATION.md)의 `npm run eval` 결과 |
| 10 | Principle | 판단은 연구자에게, 실행은 에이전트에게 | — |

두 사례는 모두 **가상 사례**입니다. 실제 학생·교사·설문·IRB 승인은 없습니다. 대화 화면은 실제 세션을 녹화한 것이 아니라 공개 기록을 바탕으로 재구성했고, 장면마다 오른쪽 아래에 그 사실을 적었습니다.

## 다시 만들기

```bash
cd docs/video/v0.7/remotion
npm ci
npm run audio      # 나레이션 · 타이밍 · 자막 · 합성 음악 · 효과음
npm run render     # rok-v0.7-raw.mp4 (Git 제외)
npm run master     # 음량 정규화 → research-orchestrator-kit-v0.7.mp4
npm run poster
```

`npm run audio`는 `narration.json`의 대본으로 나레이션을 만들고 음성 길이에 맞춰 장면 길이와 `captions.srt`를 정합니다. Microsoft Edge TTS를 먼저 시도하고, 응답하지 않으면 Google TTS(`pip install gTTS`)를 씁니다. 이번 버전도 Edge TTS가 403으로 응답해 Google TTS로 만들었습니다. 영어 고유명사는 `speech` 필드에 한글 발음으로 적었습니다.
