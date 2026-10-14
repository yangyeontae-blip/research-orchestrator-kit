import React from 'react';
import { AbsoluteFill, Audio, Composition, Easing, Sequence, interpolate, registerRoot, spring, staticFile, useCurrentFrame } from 'remotion';
import { loadFont as loadSans } from '@remotion/google-fonts/NotoSansKR';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import timeline from './timeline.json';

const { fontFamily: SANS } = loadSans('normal', { weights: ['400', '500', '700', '900'] });
const { fontFamily: MONO } = loadMono('normal', { weights: ['400', '700'] });

const FPS = timeline.fps;
const C = {
  bg: '#05070E', panel: '#0C1222', line: '#1C2640', ink: '#F4F7FF', muted: '#8A97B8', dim: '#4A5675',
  cyan: '#5EEAD4', violet: '#A78BFA', amber: '#FBBF24', red: '#F87171', green: '#4ADE80', blue: '#60A5FA'
};
const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const t = (f, a, b) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: EASE });
const pop = (f, delay = 0, config = {}) => spring({ frame: f - delay, fps: FPS, config: { damping: 15, mass: 0.7, ...config } });
const mix = (a, b, k) => a + (b - a) * k;
const scene = id => timeline.scenes.find(s => s.id === id);

/* ---------- shared ---------- */

function Backdrop() {
  const f = useCurrentFrame();
  const drift = Math.sin(f / 90) * 40;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(900px 600px at ${30 + drift / 20}% 18%, #1E3A8A33, transparent 70%), radial-gradient(800px 600px at ${75 - drift / 25}% 88%, #5B21B633, transparent 70%)` }} />
      <AbsoluteFill style={{ opacity: 0.32, transform: `translateY(${(f * 0.25) % 64}px)`, backgroundImage: `linear-gradient(${C.line}55 1px, transparent 1px), linear-gradient(90deg, ${C.line}55 1px, transparent 1px)`, backgroundSize: '64px 64px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, #000000AA 100%)' }} />
    </AbsoluteFill>
  );
}

function SceneFrame({ duration, children }) {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, 12, duration - 12, duration], [0, 1, 1, 0], clamp);
  const scale = interpolate(f, [0, duration], [1.015, 1], clamp);
  return <AbsoluteFill style={{ opacity, transform: `scale(${scale})`, fontFamily: SANS, color: C.ink }}>{children}</AbsoluteFill>;
}

function Headline({ children, at = 0, size = 58, top = 92 }) {
  const f = useCurrentFrame();
  const k = t(f, at, at + 20);
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, textAlign: 'center', opacity: k, transform: `translateY(${(1 - k) * 22}px)` }}>
      <div style={{ fontSize: size, fontWeight: 900, letterSpacing: -2, lineHeight: 1.15 }}>{children}</div>
    </div>
  );
}

function Chip({ children, color = C.cyan, style }) {
  return <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 999, border: `1.5px solid ${color}`, background: `${color}14`, color, fontFamily: MONO, fontSize: 22, fontWeight: 700, boxShadow: `0 0 26px ${color}33`, whiteSpace: 'nowrap', ...style }}>{children}</div>;
}

function Panel({ children, style, glow = C.cyan }) {
  return <div style={{ background: `linear-gradient(180deg, ${C.panel}F2, #080C18F2)`, border: `1px solid ${C.line}`, borderRadius: 22, boxShadow: `0 30px 80px #00000099, 0 0 0 1px #FFFFFF08 inset, 0 0 60px ${glow}14`, ...style }}>{children}</div>;
}

function Bubble({ children, user, k = 1, style }) {
  return (
    <div style={{ display: 'flex', justifyContent: user ? 'flex-end' : 'flex-start', opacity: k, transform: `translateY(${(1 - k) * 14}px)`, ...style }}>
      <div style={{ maxWidth: '86%', padding: '16px 22px', borderRadius: user ? '22px 22px 6px 22px' : '22px 22px 22px 6px', background: user ? '#1E3A8A' : '#111A30', border: user ? 'none' : `1px solid ${C.line}`, fontSize: 26, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

// Marks screens rebuilt from the public synthetic record rather than captured from a live session.
function Note({ children, at = 10 }) {
  const f = useCurrentFrame();
  return <div style={{ position: 'absolute', right: 60, top: 880, fontFamily: MONO, fontSize: 17, color: C.dim, opacity: t(f, at, at + 14) }}>{children}</div>;
}

function Captions() {
  const f = useCurrentFrame();
  const current = timeline.scenes.find(s => f >= s.from && f < s.from + s.frames);
  if (!current || ['title', 'close'].includes(current.id)) return null;
  const cue = timeline.captions.find(c => f >= c.from && f < c.to + 8);
  if (!cue) return null;
  const k = interpolate(f, [cue.from, cue.from + 6, cue.to + 2, cue.to + 8], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: 'absolute', bottom: 44, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: k, transform: `translateY(${(1 - k) * 8}px)` }}>
      <div style={{ maxWidth: 1560, padding: '14px 32px', borderRadius: 16, background: '#05070EE6', border: `1px solid ${C.line}`, boxShadow: '0 10px 40px #000A', fontFamily: SANS, fontSize: 36, fontWeight: 700, color: C.ink, textAlign: 'center', lineHeight: 1.4 }}>{cue.text}</div>
    </div>
  );
}

function Chrome() {
  const f = useCurrentFrame();
  const index = timeline.scenes.findIndex(s => f >= s.from && f < s.from + s.frames);
  const labels = ['Topics', 'v0.7', 'Invoke', 'Discuss', 'Agree', 'Draft', 'Honesty', 'Two topics', 'Deep mode', 'Principle'];
  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, height: 4, width: `${(f / timeline.total_frames) * 100}%`, background: `linear-gradient(90deg, ${C.cyan}, ${C.violet})` }} />
      <div style={{ position: 'absolute', top: 34, left: 56, fontFamily: MONO, fontSize: 20, color: C.muted, letterSpacing: 2 }}>
        <span style={{ color: C.cyan, fontWeight: 700 }}>ROK</span> / {String(index + 1).padStart(2, '0')} · {labels[index]?.toUpperCase()}
      </div>
      <div style={{ position: 'absolute', top: 34, right: 56, fontFamily: MONO, fontSize: 20, color: C.dim, letterSpacing: 2 }}>RESEARCH ORCHESTRATOR KIT · v0.7 · 가상 사례</div>
    </>
  );
}

function Typed({ text, start, f, speed = 1.3 }) {
  const n = Math.max(0, Math.min(text.length, Math.floor((f - start) * speed)));
  return <>{text.slice(0, n)}{n < text.length && f >= start ? <span style={{ color: C.cyan }}>▌</span> : null}</>;
}

/* ---------- 1. hook ---------- */

function Hook({ d }) {
  const f = useCurrentFrame();
  const topics = [
    ['초등학생의 생성형 AI 활용', 'prompt-ai.md', 380, 290, C.blue],
    ['보건교사의 직무 스트레스', 'prompt-health.md', 1540, 280, C.green],
    ['중학생 독서토론 수업', 'prompt-reading.md', 330, 640, C.violet],
    ['성인의 수면 부족', 'prompt-sleep.md', 1580, 630, C.amber],
    ['초임교사의 교직 적응', 'prompt-novice.md', 960, 790, C.cyan]
  ];
  const merge = t(f, d * 0.48, d * 0.7);
  const core = pop(f, d * 0.62, { damping: 18 });
  return (
    <SceneFrame duration={d}>
      <div style={{ opacity: 1 - t(f, d * 0.45, d * 0.55) }}><Headline at={4}>주제마다 <span style={{ color: C.red }}>새 지침</span>을 써야 할까?</Headline></div>
      {topics.map(([topic, file, x, y, color], i) => {
        const k = pop(f, 6 + i * 6);
        const cx = mix(x, 960, merge), cy = mix(y, 520, merge);
        return (
          <div key={topic} style={{ position: 'absolute', left: cx, top: cy, transform: `translate(-50%, -50%) scale(${mix(0.85, 1, k) * mix(1, 0.6, merge)})`, opacity: k * (1 - t(f, d * 0.62, d * 0.72)), textAlign: 'center' }}>
            <Panel glow={color} style={{ padding: '18px 26px' }}>
              <div style={{ fontSize: 30, fontWeight: 700 }}>{topic}</div>
              <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 18, color: C.red, textDecoration: merge > 0.2 ? 'line-through' : 'none' }}>{file}</div>
            </Panel>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 960, top: 520, transform: `translate(-50%, -50%) scale(${mix(0.6, 1, core)})`, opacity: core, textAlign: 'center' }}>
        <Panel glow={C.cyan} style={{ padding: '30px 54px', borderColor: C.cyan }}>
          <div style={{ fontFamily: MONO, fontSize: 64, fontWeight: 700, color: C.cyan }}>AGENTS.md</div>
          <div style={{ marginTop: 10, fontSize: 28, color: C.muted }}>주제를 정하지 않은 범용 연구계획서 에이전트</div>
        </Panel>
      </div>
      <Headline at={d * 0.66}>주제는 바뀌어도 <span style={{ color: C.cyan }}>지침은 하나</span></Headline>
    </SceneFrame>
  );
}

/* ---------- 2. title ---------- */

function Title({ d }) {
  const f = useCurrentFrame();
  const l = pop(f, 6, { damping: 20 }), r = pop(f, 22, { damping: 20 }), w = t(f, d * 0.45, d * 0.58);
  return (
    <SceneFrame duration={d}>
      <div style={{ position: 'absolute', top: 290, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 60 }}>
        <div style={{ fontSize: 104, fontWeight: 900, letterSpacing: -4, opacity: l, filter: `blur(${(1 - l) * 10}px)`, transform: `translateX(${(1 - l) * -40}px)` }}>연구자는 판단하고</div>
        <div style={{ fontSize: 104, fontWeight: 900, letterSpacing: -4, color: C.cyan, opacity: r, filter: `blur(${(1 - r) * 10}px)`, transform: `translateX(${(1 - r) * 40}px)` }}>에이전트는 실행한다</div>
      </div>
      <div style={{ position: 'absolute', top: 510, left: 0, right: 0, textAlign: 'center', opacity: w, transform: `translateY(${(1 - w) * 20}px)` }}>
        <div style={{ fontSize: 46, fontWeight: 700, color: C.muted }}>Research Orchestrator Kit <span style={{ color: C.ink }}>0.7</span></div>
        <div style={{ marginTop: 34, display: 'flex', justifyContent: 'center', gap: 14 }}>
          {[['AGENTS.md', C.cyan], ['Codex 대화', C.blue], ['proposal-draft.md', C.green], ['rok · 선택', C.muted]].map(([c, color], i) => <div key={c} style={{ opacity: t(f, d * 0.55 + i * 5, d * 0.62 + i * 5) }}><Chip color={color}>{c}</Chip></div>)}
        </div>
      </div>
    </SceneFrame>
  );
}

/* ---------- 3. invoke ---------- */

function Invoke({ d }) {
  const f = useCurrentFrame();
  const ask = '이 저장소의 AGENTS.md에 따라, 중학생 독서토론 수업 효과에 관한 연구 아이디어를 저와 논의한 뒤 연구계획서 초안을 작성해 줘.';
  const questions = [
    ['연구 유형은 무엇인가요? 현장연구 · 학위논문', '계획서 구조와 분량이 달라집니다.'],
    ['제출 형식이 있나요? generic · APA 7 · JQI', '주제만 보고 대신 고르지 않습니다.'],
    ['실제 학생인가요, 가상 사례인가요?', '미성년자 자료는 동의·승인 절차가 필요합니다.']
  ];
  const qAt = d * 0.4;
  return (
    <SceneFrame duration={d}>
      <Panel style={{ position: 'absolute', left: 120, top: 110, width: 1180, height: 750, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: '#0F172A', borderBottom: `1px solid ${C.line}` }}>
          {[C.red, C.amber, C.green].map(c => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
          <div style={{ marginLeft: 14, fontFamily: MONO, fontSize: 19, color: C.muted }}>Codex · research-orchestrator-kit</div>
        </div>
        <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Bubble user k={t(f, 4, 14)}><Typed text={ask} start={8} f={f} speed={2.4} /></Bubble>
          <div style={{ fontFamily: MONO, fontSize: 21, color: C.green, opacity: t(f, d * 0.3, d * 0.36) }}>✓ workspace/.write-check 생성·삭제 · 파일 저장 가능</div>
          <Bubble k={t(f, qAt, qAt + 12)}>
            <div style={{ fontWeight: 700 }}>바로 쓰기 전에 세 가지만 여쭐게요.</div>
            {questions.map(([q, why], i) => (
              <div key={q} style={{ marginTop: 12, opacity: t(f, qAt + 10 + i * 14, qAt + 22 + i * 14) }}>
                <div>{i + 1}. {q}</div>
                <div style={{ fontSize: 21, color: C.muted }}>└ {why}</div>
              </div>
            ))}
          </Bubble>
          <Bubble user k={t(f, d * 0.8, d * 0.86)}>“완전 가상 사례” · “현장연구” · “generic(정해진 양식 없음)”</Bubble>
        </div>
      </Panel>
      <div style={{ position: 'absolute', left: 1360, top: 200, width: 440, display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ opacity: t(f, d * 0.2, d * 0.28) }}>
          <Panel glow={C.red} style={{ padding: '22px 26px', borderColor: C.red }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: C.red, textDecoration: 'line-through' }}>계획서 바로 작성</div>
            <div style={{ marginTop: 6, fontSize: 22, color: C.muted }}>주제를 받아도 먼저 묻습니다</div>
          </Panel>
        </div>
        {[['0', '저장 가능 확인', C.green, 0.32], ['1', '질문 ≤ 3개 · 이유 포함', C.cyan, 0.45], ['?', '형식·유형은 연구자가', C.amber, 0.6]].map(([n, label, color, at]) => (
          <div key={label} style={{ opacity: t(f, d * at, d * at + 10) }}><Chip color={color} style={{ fontFamily: SANS }}>{n} · {label}</Chip></div>
        ))}
      </div>
      <Note at={d * 0.2}>공개 가상 사례 기록을 바탕으로 재구성한 화면</Note>
    </SceneFrame>
  );
}

/* ---------- 4. discuss ---------- */

function Discuss({ d }) {
  const f = useCurrentFrame();
  const cards = [
    ['A', '수업반·비교반 + 학생 성찰', '혼합 · 설명적 순차', '점수 변화와 그 이유를 함께', '비무작위 반 배정 · 인과 단정 불가', true],
    ['B', '한 반 사전·사후 비교', '양적', '절차가 단순하고 짧음', '비교 집단이 없음', false],
    ['C', '토론 경험 탐색', '질적', '과정의 의미를 깊이 이해', '변화의 크기는 알 수 없음', false]
  ];
  const pickAt = d * 0.6;
  const picked = f >= pickAt;
  return (
    <SceneFrame duration={d}>
      <Headline at={0}>방향은 <span style={{ color: C.cyan }}>두세 안</span>, 선택은 연구자</Headline>
      <div style={{ position: 'absolute', left: 120, right: 120, top: 220, display: 'flex', gap: 30 }}>
        {cards.map(([id, title, method, pro, risk, chosen], i) => {
          const k = pop(f, 10 + i * 10);
          const on = picked && chosen;
          const off = picked && !chosen;
          return (
            <Panel key={id} glow={on ? C.green : C.cyan} style={{ flex: 1, padding: '26px 30px', opacity: k * (off ? 0.4 : 1), transform: `scale(${mix(0.92, 1, k) * (on ? 1 + 0.03 * t(f, pickAt, pickAt + 10) : 1)})`, borderColor: on ? C.green : C.line }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, color: on ? C.green : C.cyan }}>{id}</div>
                {chosen && <Chip color={on ? C.green : C.violet} style={{ fontSize: 18, padding: '6px 12px' }}>{on ? '연구자 선택' : '추천안'}</Chip>}
              </div>
              <div style={{ marginTop: 12, fontSize: 32, fontWeight: 900, lineHeight: 1.3 }}>{title}</div>
              <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 20, color: C.blue }}>{method}</div>
              <div style={{ marginTop: 18, fontSize: 23, color: C.green }}>＋ {pro}</div>
              <div style={{ marginTop: 8, fontSize: 23, color: C.amber }}>－ {risk}</div>
            </Panel>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 660, display: 'flex', justifyContent: 'center' }}>
        <Bubble user k={t(f, pickAt - 8, pickAt + 4)} style={{ justifyContent: 'center' }}>“A 추천안 선택”</Bubble>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 780, display: 'flex', justifyContent: 'center', opacity: t(f, d * 0.74, d * 0.82) }}>
        <Chip color={C.violet} style={{ fontFamily: SANS }}>추천은 합의가 아니라 제안 → 다음 단계에서 항목별로 다시 동의</Chip>
      </div>
      <Note at={d * 0.2}>A·사용자 선택은 공개 기록 · B·C는 비교를 위해 재구성</Note>
    </SceneFrame>
  );
}

/* ---------- 5. agree ---------- */

function Agree({ d }) {
  const f = useCurrentFrame();
  const rows = [
    ['RQ1', '두 반의 변화 차이', '사전·사후 논증 과제 점수', '학년도별 변화량 · 반 간 비교'],
    ['RQ2', '수업반 학생 경험', '자발적 성찰 글', '주제 분석'],
    ['RQ3', '두 결과의 통합', '정량 요약 + 성찰 주제', '일치·불일치 대응표']
  ];
  const consentAt = d * 0.56;
  const consent = f >= consentAt;
  const quotes = ['“A 추천안 선택”', '“절차에 동의”', '“가설에 동의”', '“요약 전체에 동의”'];
  return (
    <SceneFrame duration={d}>
      <Headline at={0}>동의 전에는 <span style={{ color: C.cyan }}>쓰지 않습니다</span></Headline>
      <Panel style={{ position: 'absolute', left: 120, top: 230, width: 1100, padding: '24px 32px' }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.dim, marginBottom: 10 }}>연구문제 – 자료 – 분석 대응 점검</div>
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 1fr 60px', padding: '10px 0', borderBottom: `1px solid ${C.line}`, fontSize: 21, color: C.muted }}>
          <div>연구문제</div><div>자료</div><div>분석</div><div />
        </div>
        {rows.map(([id, q, data, analysis], i) => {
          const on = t(f, 14 + i * 16, 26 + i * 16);
          const ok = f >= 40 + i * 16;
          return (
            <div key={id} style={{ display: 'grid', gridTemplateColumns: '300px 1fr 1fr 60px', alignItems: 'center', padding: '18px 0', borderBottom: `1px solid ${C.line}`, opacity: on }}>
              <div style={{ fontSize: 25, fontWeight: 700 }}><span style={{ fontFamily: MONO, color: C.cyan }}>{id}</span> {q}</div>
              <div style={{ fontSize: 24 }}>{data}</div>
              <div style={{ fontSize: 24 }}>{analysis}</div>
              <div style={{ fontSize: 30, color: C.green, opacity: ok ? 1 : 0 }}>✓</div>
            </div>
          );
        })}
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Chip color={consent ? C.green : C.amber} style={{ fontFamily: SANS }}>{consent ? '✓ 명시적 동의 · 초안 작성 시작' : '⏸ 연구자 동의 대기'}</Chip>
        </div>
      </Panel>
      <div style={{ position: 'absolute', left: 1270, top: 230, width: 530 }}>
        <Bubble user k={t(f, consentAt - 10, consentAt)}>“요약 전체에 동의”</Bubble>
        <Panel glow={C.violet} style={{ marginTop: 24, padding: '22px 26px', opacity: t(f, consentAt + 6, consentAt + 18) }}>
          <div style={{ fontFamily: MONO, fontSize: 20, color: C.violet, marginBottom: 8 }}>부록 1 · 합의 사항 (사용자 문장 그대로)</div>
          {quotes.map((q, i) => (
            <div key={q} style={{ padding: '10px 0', borderBottom: `1px solid ${C.line}`, fontSize: 25, opacity: t(f, consentAt + 14 + i * 7, consentAt + 22 + i * 7) }}>{q}</div>
          ))}
        </Panel>
      </div>
      <Note at={d * 0.2}>연구문제와 인용 문장은 공개 가상 사례 초안에서 발췌</Note>
    </SceneFrame>
  );
}

/* ---------- 6. draft ---------- */

function Draft({ d }) {
  const f = useCurrentFrame();
  const checks = ['합의하지 않은 내용은 [제안]', '질문–자료–분석 일대일 대응', '인용·저자·수치를 지어내지 않음', '미확인 근거에 [미확인] 표시', '경험·결과를 사실처럼 쓰지 않음', '선택한 형식 준수 (generic)', '대상에 맞는 윤리 고려', '합의 문장 그대로 인용'];
  const start = d * 0.3, each = (d * 0.55) / checks.length;
  const file = [
    ['workspace/', C.muted, 0],
    ['└ virtual-middle-school-reading-discussion/', C.muted, 1],
    ['   └ proposal-draft.md', C.cyan, 2]
  ];
  const facts = [['✓ 저장 뒤 파일 존재 확인', C.green], ['21,367 바이트', C.ink], ['sha256 6f265a81…ce01', C.muted], ['본문 7,195자 (표·부록 제외)', C.ink]];
  return (
    <SceneFrame duration={d}>
      <Headline at={0}>저장하고, <span style={{ color: C.cyan }}>확인하고</span>, 점검합니다</Headline>
      <Panel style={{ position: 'absolute', left: 120, top: 230, width: 800, padding: '26px 32px' }}>
        {file.map(([line, color, i]) => <div key={line} style={{ fontFamily: MONO, fontSize: 23, color, lineHeight: 1.7, opacity: t(f, 8 + i * 8, 18 + i * 8), whiteSpace: 'pre' }}>{line}</div>)}
        <div style={{ marginTop: 20, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
          {facts.map(([text, color], i) => <div key={text} style={{ fontFamily: i === 2 ? MONO : SANS, fontSize: 26, fontWeight: i === 0 ? 900 : 500, color, lineHeight: 1.8, opacity: t(f, 34 + i * 10, 44 + i * 10) }}>{text}</div>)}
        </div>
      </Panel>
      <Panel style={{ position: 'absolute', left: 980, top: 230, width: 820, padding: '22px 30px' }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.dim, marginBottom: 6 }}>산출 전 자체 점검 · 8개 항목</div>
        {checks.map((item, i) => {
          const on = f >= start + i * each;
          return (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '9px 0', borderBottom: `1px solid ${C.line}` }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, border: `2px solid ${on ? C.green : C.dim}`, background: on ? `${C.green}22` : 'transparent', color: C.green, fontSize: 21, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on ? '✓' : ''}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: on ? C.ink : C.dim }}>{i + 1}. {item}</div>
            </div>
          );
        })}
      </Panel>
      <Note at={d * 0.2}>파일 경로·크기·해시·글자 수는 공개 저장 기록의 실제 값</Note>
    </SceneFrame>
  );
}

/* ---------- 7. honesty ---------- */

function Honesty({ d }) {
  const f = useCurrentFrame();
  const fakeAt = d * 0.2, strikeAt = d * 0.34, tagAt = d * 0.44;
  const items = [['루브릭과 동형 과제', '[미확인]', C.amber], ['문헌 공백과 기존 혼합 연구', '[미확인: 문헌 확인 필요]', C.amber], ['실제 학급·점수·성찰 내용', '[미확인]', C.amber], ['학생 자료 보관·삭제 세부', '[제안]', C.violet]];
  return (
    <SceneFrame duration={d}>
      <Headline at={0}>없는 근거는 <span style={{ color: C.amber }}>만들지 않습니다</span></Headline>
      <Panel style={{ position: 'absolute', left: 120, top: 230, width: 1020, padding: '26px 34px' }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.dim }}>proposal-draft.md</div>
        <div style={{ marginTop: 14, fontSize: 26, fontWeight: 900, color: C.blue }}>## 1. 연구 배경과 필요성</div>
        <div style={{ marginTop: 10, fontSize: 26, lineHeight: 1.6 }}>
          학술적 공백은 아직 검색·검증하지 않았다{' '}
          {f < tagAt ? (
            <span style={{ opacity: t(f, fakeAt, fakeAt + 8), color: C.red, position: 'relative', fontWeight: 700 }}>
              (○○, 2021)
              <span style={{ position: 'absolute', left: -4, right: -4, top: '52%', height: 4, background: C.red, transform: `scaleX(${t(f, strikeAt, strikeAt + 8)})`, transformOrigin: 'left' }} />
            </span>
          ) : (
            <span style={{ opacity: t(f, tagAt, tagAt + 8), color: C.amber, fontFamily: MONO, fontSize: 23, fontWeight: 700 }}>[미확인: 문헌 확인 필요]</span>
          )}
        </div>
        <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 19, color: C.red, opacity: f >= strikeAt && f < tagAt + 20 ? 1 : 0 }}>✕ 지어낸 인용은 넣지 않음</div>
        <div style={{ marginTop: 22, fontSize: 26, fontWeight: 900, color: C.blue, opacity: t(f, d * 0.5, d * 0.56) }}>## 4. 연구방법</div>
        <div style={{ marginTop: 10, fontSize: 26, lineHeight: 1.6, opacity: t(f, d * 0.52, d * 0.58) }}>
          <span style={{ color: C.violet, fontFamily: MONO, fontSize: 23, fontWeight: 700 }}>[제안]</span> 사전 점수 차이가 크면 이를 고려한 비교를 검토한다.
        </div>
        <div style={{ marginTop: 22, fontSize: 26, fontWeight: 900, color: C.blue, opacity: t(f, d * 0.62, d * 0.68) }}>## 8. 참고문헌</div>
        <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900, color: C.green, opacity: t(f, d * 0.64, d * 0.7) }}>확인된 문헌 없음.</div>
      </Panel>
      <Panel glow={C.amber} style={{ position: 'absolute', left: 1190, top: 230, width: 610, padding: '22px 28px', opacity: t(f, d * 0.56, d * 0.64) }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.amber, marginBottom: 6 }}>부록 2 · 확인되지 않은 항목</div>
        {items.map(([label, tag, color], i) => (
          <div key={label} style={{ padding: '12px 0', borderBottom: `1px solid ${C.line}`, opacity: t(f, d * 0.6 + i * 6, d * 0.66 + i * 6) }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{label}</div>
            <div style={{ fontFamily: MONO, fontSize: 19, color }}>{tag}</div>
          </div>
        ))}
      </Panel>
      <Note at={d * 0.2}>(○○, 2021)은 막아야 할 예를 보여 주는 가상 표기 · 나머지 문장은 초안에서 발췌</Note>
    </SceneFrame>
  );
}

/* ---------- 8. two topics ---------- */

function Topics({ d }) {
  const f = useCurrentFrame();
  const cases = [
    ['가상 사례 1', '학교 보건교사의 직무 스트레스', '양적 · 설문', [['질문 항목', '14개 (반복 포함)'], ['본문', '6,334자'], ['저장', 'virtual-school-health-teacher-stress/'], ['sha256', 'cd38321f…977f']], C.green],
    ['가상 사례 2', '중학생 독서토론 수업 효과', '혼합 · 설명적 순차', [['질문 항목', '12개'], ['본문', '7,195자'], ['저장', 'virtual-middle-school-reading-discussion/'], ['sha256', '6f265a81…ce01']], C.violet]
  ];
  const split = t(f, 14, 40);
  return (
    <SceneFrame duration={d}>
      <Headline at={0}>같은 AGENTS.md, <span style={{ color: C.cyan }}>다른 연구</span></Headline>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 205, display: 'flex', justifyContent: 'center', opacity: t(f, 4, 14) }}><Chip color={C.cyan} style={{ fontSize: 26 }}>AGENTS.md · 0~4단계 · 같은 첫 문장</Chip></div>
      <svg width={1920} height={120} style={{ position: 'absolute', left: 0, top: 260 }}>
        {[540, 1380].map(x => <path key={x} d={`M960 10 C960 70, ${x} 50, ${x} 110`} stroke={C.cyan} strokeWidth={3} fill="none" strokeDasharray={600} strokeDashoffset={600 * (1 - split)} opacity={0.7} />)}
      </svg>
      {cases.map(([label, title, method, rows, color], i) => {
        const k = pop(f, 30 + i * 12);
        return (
          <Panel key={label} glow={color} style={{ position: 'absolute', left: i ? 1000 : 160, top: 380, width: 760, padding: '24px 32px', opacity: k, transform: `translateY(${(1 - k) * 30}px)` }}>
            <div style={{ fontFamily: MONO, fontSize: 19, color: C.dim }}>{label}</div>
            <div style={{ marginTop: 6, fontSize: 34, fontWeight: 900 }}>{title}</div>
            <div style={{ marginTop: 12 }}><Chip color={color} style={{ fontFamily: SANS, fontSize: 22 }}>{method}</Chip></div>
            {rows.map(([key, value], j) => (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', padding: '10px 0', borderBottom: `1px solid ${C.line}`, opacity: t(f, 50 + i * 12 + j * 8, 60 + i * 12 + j * 8) }}>
                <div style={{ fontSize: 22, color: C.muted }}>{key}</div>
                <div style={{ fontSize: j >= 2 ? 20 : 24, fontWeight: 700, fontFamily: j >= 2 ? MONO : SANS }}>{value}</div>
              </div>
            ))}
            <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 20, color: C.green, opacity: t(f, 90 + i * 12, 100 + i * 12) }}>✓ .md 저장 확인</div>
          </Panel>
        );
      })}
      <Note at={d * 0.3}>쓰기 가능한 Codex 데스크톱 대화 · 2026-10-14 · 실제 설문·학생·IRB 승인 없음</Note>
    </SceneFrame>
  );
}

/* ---------- 9. deep mode ---------- */

function Deep({ d }) {
  const f = useCurrentFrame();
  const nodes = [
    ['proposal-draft.md', '대화 초안', false],
    ['import-plan', '--sha256', false],
    ['validate', '구조 검사', false],
    ['verify-use', '연구자 확인', true],
    ['approve', '수집 승인', true],
    ['수집·검토', '원문 · 독립 검토', false],
    ['finalize', '연구자 확정', true]
  ];
  const gap = 240, x0 = 240, y = 300;
  const lit = Math.min(nodes.length, (f - 10) / ((d * 0.42) / nodes.length));
  const stat = t(f, d * 0.55, d * 0.63);
  return (
    <SceneFrame duration={d}>
      <Headline at={0}>더 깊이: <span style={{ color: C.cyan }}>심화 모드</span> <span style={{ fontSize: 34, color: C.muted }}>(선택)</span></Headline>
      <div style={{ position: 'absolute', left: x0, top: y + 36, width: gap * 6, height: 3, background: C.line }} />
      <div style={{ position: 'absolute', left: x0, top: y + 36, width: gap * Math.max(0, Math.min(6, lit - 1)), height: 3, background: C.cyan, boxShadow: `0 0 14px ${C.cyan}` }} />
      {nodes.map(([name, sub, human], i) => {
        const on = lit > i;
        const color = human ? C.amber : C.cyan;
        return (
          <div key={name} style={{ position: 'absolute', left: x0 + i * gap - 110, top: y, width: 220, textAlign: 'center', opacity: on ? 1 : 0.3 }}>
            <div style={{ margin: '0 auto', width: 74, height: 74, borderRadius: 37, background: on ? `${color}22` : C.panel, border: `2px solid ${on ? color : C.dim}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, color }}>{human ? '⏸' : i + 1}</div>
            <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 21, fontWeight: 700, color: on ? C.ink : C.dim }}>{name}</div>
            <div style={{ marginTop: 4, fontSize: 19, color: human ? C.amber : C.muted }}>{sub}</div>
          </div>
        );
      })}
      <Panel glow={C.green} style={{ position: 'absolute', left: 260, right: 260, top: 560, padding: '24px 36px', opacity: stat, transform: `translateY(${(1 - stat) * 20}px)` }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.dim }}>인용 위치 대조 · npm run eval · 합성 결함 주입</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 60, alignItems: 'baseline' }}>
          <div><span style={{ fontSize: 60, fontWeight: 900, color: C.green }}>140/140</span><span style={{ marginLeft: 12, fontSize: 26 }}>잘못된 인용 차단</span></div>
          <div><span style={{ fontSize: 60, fontWeight: 900, color: C.green }}>0/40</span><span style={{ marginLeft: 12, fontSize: 26 }}>정상 인용 오거부</span></div>
        </div>
        <div style={{ marginTop: 8, fontSize: 22, color: C.muted }}>단순 문자열 일치 기준선: 57% 차단 · 50% 오거부 — 의미상 지지 여부는 연구자가 판단</div>
      </Panel>
    </SceneFrame>
  );
}

/* ---------- 10. close ---------- */

function Close({ d }) {
  const f = useCurrentFrame();
  const l1 = t(f, 6, 24), l2 = t(f, d * 0.22, d * 0.22 + 18), up = t(f, d * 0.5, d * 0.62), mark = pop(f, d * 0.54, { damping: 20 });
  return (
    <SceneFrame duration={d}>
      <AbsoluteFill style={{ background: `rgba(0,0,0,${0.55 * t(f, 0, 20)})` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: mix(380, 230, up), textAlign: 'center' }}>
        <div style={{ fontSize: mix(78, 54, up), fontWeight: 900, opacity: l1, letterSpacing: -2 }}>판단은 연구자에게.</div>
        <div style={{ fontSize: mix(78, 54, up), fontWeight: 900, opacity: l2, letterSpacing: -2, color: C.cyan, marginTop: 14 }}>실행은 에이전트에게.</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 560, textAlign: 'center', opacity: mark, transform: `translateY(${(1 - mark) * 30}px)` }}>
        <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: -4 }}>Research <span style={{ color: C.cyan }}>Orchestrator</span> Kit</div>
        <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center', gap: 18 }}>
          <Chip color={C.cyan}>AGENTS.md</Chip>
          <Chip color={C.muted}>github.com/yangyeontae-blip/research-orchestrator-kit</Chip>
        </div>
      </div>
    </SceneFrame>
  );
}

/* ---------- composition ---------- */

const SCENES = { hook: Hook, title: Title, invoke: Invoke, discuss: Discuss, agree: Agree, draft: Draft, honesty: Honesty, topics: Topics, deep: Deep, close: Close };

function Sounds() {
  const at = (id, k) => scene(id).from + Math.round(scene(id).frames * k);
  const draft = scene('draft');
  const cues = [
    ...timeline.scenes.slice(1).map(s => ['whoosh', s.from, 0.18]),
    ['chime', at('hook', 0.62), 0.25],
    ['chime', at('discuss', 0.6), 0.25],
    ['chime', at('agree', 0.56), 0.32],
    ...Array.from({ length: 8 }, (_, i) => ['tick', draft.from + Math.round(draft.frames * 0.3 + ((draft.frames * 0.55) / 8) * i), 0.25]),
    ['deny', at('honesty', 0.34), 0.45],
    ['chime', at('deep', 0.55), 0.25],
    ['chime', at('close', 0.54), 0.25]
  ];
  return (
    <>
      <Audio src={staticFile('music.mp3')} volume={timeline.narrated ? 0.38 : 0.85} />
      {timeline.scenes.filter(s => s.voice).map(s => <Sequence key={s.id} from={s.from + s.lead_frames}><Audio src={staticFile(s.voice)} /></Sequence>)}
      {cues.map(([name, from, volume], i) => <Sequence key={i} from={from}><Audio src={staticFile(`${name}.mp3`)} volume={volume} /></Sequence>)}
    </>
  );
}

function Video() {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Backdrop />
      {timeline.scenes.map(s => {
        const Scene = SCENES[s.id];
        return <Sequence key={s.id} from={s.from} durationInFrames={s.frames}><Scene d={s.frames} /></Sequence>;
      })}
      <Chrome />
      <Captions />
      <Sounds />
    </AbsoluteFill>
  );
}

registerRoot(() => <Composition id="RokV07" component={Video} durationInFrames={timeline.total_frames} fps={FPS} width={1920} height={1080} />);
