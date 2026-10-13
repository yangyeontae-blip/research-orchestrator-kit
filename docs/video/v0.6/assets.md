# 자산 및 권리

- 그래픽: Remotion/React로 직접 만든 모션 그래픽. 외부 이미지, 로고, 논문 본문 없음.
- 블루프린트 장면: ROK 블루프린트 렌더러로 합성 계획서(`examples/synthetic-v2/apa7-autoethnography/plan.md`)를 렌더링한 실제 출력.
- 화면 속 파일명, 해시, 건수, 주장, 저자명, 쪽수: 모두 합성 예시. 실제 연구자료나 실제 문헌이 아님.
- 음악: `build-audio.mjs`가 표본 단위로 합성한 96 BPM 패드·아르페지오·킥·하이햇. 녹음 음악이나 샘플 없음.
- 효과음: FFmpeg `aevalsrc`·`anoisesrc`로 합성한 차임, 저음, 틱, 노이즈 스윕.
- 글꼴: Noto Sans KR, JetBrains Mono (SIL Open Font License 1.1), `@remotion/google-fonts`로 렌더링 시 불러옴.
- 렌더링: Remotion 4.0.534. Remotion은 자체 라이선스를 따름 (https://www.remotion.dev/license).
- 나레이션: Google TTS(gTTS, 한국어)로 생성하고 FFmpeg로 1.18배 속도·앞뒤 무음 정리. Microsoft Edge TTS가 응답하면 그쪽을 우선 사용.
