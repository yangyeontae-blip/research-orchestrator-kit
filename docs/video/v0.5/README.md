# v0.5 소개 영상 소스

98초, 1920×1080, 30fps, 한국어 나레이션과 자막. 기능 목록을 나열하지 않고, 오케스트레이터가 상태를 실제로 다루는 방식을 장면마다 하나씩 움직여 보여줍니다.

| # | 장면 | 보여주는 메커니즘 |
|---|---|---|
| 1 | Versions | `계획서_최종_진짜.docx` 다섯 개, 서로 다른 해시 |
| 2 | Overview | 해시 링과 아이디어 → 계획서 → 문헌 근거 → 보완본 결속 |
| 3 | Orchestration | 기획팀장이 네 역할에 handoff를 보내고 receipt를 받는 흐름 |
| 4 | Human gates | 계획서 해시 칩이 파이프라인을 지나며 TTY에서 `APPROVE` 입력으로 관문을 여는 장면 |
| 5 | Invalidation | 한 글자 수정 → 해시 재계산 → 수집 승인 무효 |
| 6 | Recovery | `rework` · `release` · `state.lock` 회수 · `retry --rebind` |
| 7 | Evidence | `claim-ledger.json`의 네 가지 근거 상태 |
| 8 | Outputs | `plan.md` 하나에서 DOCX·HWPX 재생성 |
| 9 | Principle | 판단은 연구자에게, 기록은 오케스트레이터에게 |

## 다시 만들기

```bash
pip install edge-tts                 # 나레이션
cd docs/video/v0.5/remotion
npm ci
npm run audio                        # 나레이션 · 타임라인 · 자막 · 합성 배경음/효과음
npm run render                       # Remotion 렌더링 (rok-v0.5-raw.mp4, Git 제외)
npm run master                       # 음량 정규화(-16 LUFS) → research-orchestrator-kit-v0.5.mp4
npm run poster
```

`npm run audio`는 `narration.json`을 읽어 장면별 음성 길이를 재고, 그 길이로 `src/timeline.json`과 `captions.srt`를 만듭니다. 장면 길이와 자막은 나레이션에서 자동으로 계산됩니다.

## 파일

- `narration.json`: 장면별 대본, 최소 길이, TTS 발음용 문장
- `build-audio.mjs`: TTS, 타이밍, 자막, FFmpeg 합성음 생성
- `captions.srt`: 자막
- `remotion/src/index.jsx`: 모든 장면의 모션 그래픽
- `assets.md`: 자산 출처와 권리
