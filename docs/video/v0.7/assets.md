# 자산 및 권리

- 그래픽: Remotion/React로 직접 만든 모션 그래픽. 외부 이미지, 로고, 논문 본문, 화면 녹화 없음.
- 화면 속 값: 파일 경로·크기·SHA-256·글자 수·질문 수는 `docs/CHAT-REPRODUCTION-writable.md`의 공개 가상 사례 기록, 연구문제·대응표·합의 문장·미확인 항목은 그 기록의 초안에서 발췌. 대화 화면의 질문 문구와 B·C 방향 안은 재구성. `(○○, 2021)`은 지어낸 인용을 막는 모습을 보여 주기 위한 가상 표기.
- 사례: 모두 가상. 실제 학생·교사·학교·설문·IRB 승인 없음.
- 음악: `build-audio.mjs`가 표본 단위로 합성한 96 BPM 패드·아르페지오·킥·하이햇. 녹음 음악이나 샘플 없음.
- 효과음: FFmpeg `aevalsrc`·`anoisesrc`로 합성한 차임, 저음, 틱, 노이즈 스윕.
- 글꼴: Noto Sans KR, JetBrains Mono (SIL Open Font License 1.1), `@remotion/google-fonts`로 렌더링 시 불러옴.
- 렌더링: Remotion 4.0.534. Remotion은 자체 라이선스를 따름 (https://www.remotion.dev/license).
- 나레이션: Google TTS(gTTS, 한국어)로 생성하고 FFmpeg로 1.18배 속도·앞뒤 무음 정리. Microsoft Edge TTS가 응답하면 그쪽을 우선 사용.
