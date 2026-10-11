import React from 'react';
import {
  AbsoluteFill, Audio, Composition, Easing, Sequence, interpolate, registerRoot, spring, staticFile, useCurrentFrame
} from 'remotion';
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

// Deterministic pseudo-hashes so every render is identical.
function hex(seed, length = 64) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let out = '';
  while (out.length < length) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    out += ((h >>> 0) % 16).toString(16);
  }
  return out;
}
const PLAN = hex('plan-v1');
const PLAN2 = hex('plan-v2-one-char');
const short = value => `${value.slice(0, 8)}…${value.slice(-4)}`;

function scrambled(from, to, k, seed = 'x') {
  const n = Math.floor(k * from.length);
  return from.split('').map((ch, i) => (i < n ? to[i] : k > 0 && i < n + 6 ? hex(seed + i + Math.floor(k * 40), 1) : ch)).join('');
}

/* ---------- shared pieces ---------- */

function Backdrop() {
  const f = useCurrentFrame();
  const drift = Math.sin(f / 90) * 40;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(900px 600px at ${30 + drift / 20}% 20%, #1E3A8A33, transparent 70%), radial-gradient(800px 600px at ${75 - drift / 25}% 85%, #5B21B633, transparent 70%)` }} />
      <AbsoluteFill style={{
        opacity: 0.35, transform: `translateY(${(f * 0.25) % 64}px)`,
        backgroundImage: `linear-gradient(${C.line}55 1px, transparent 1px), linear-gradient(90deg, ${C.line}55 1px, transparent 1px)`,
        backgroundSize: '64px 64px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)'
      }} />
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

function Headline({ children, at = 0, size = 76, top = 96, color = C.ink, sub }) {
  const f = useCurrentFrame();
  const k = t(f, at, at + 22);
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, textAlign: 'center', opacity: k, transform: `translateY(${(1 - k) * 24}px)` }}>
      <div style={{ fontSize: size, fontWeight: 900, letterSpacing: -2, color, lineHeight: 1.15 }}>{children}</div>
      {sub && <div style={{ marginTop: 14, fontSize: 30, color: C.muted, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

function Chip({ children, color = C.cyan, style }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 999,
      border: `1.5px solid ${color}`, background: `${color}14`, color, fontFamily: MONO, fontSize: 22, fontWeight: 700,
      boxShadow: `0 0 28px ${color}33`, whiteSpace: 'nowrap', ...style
    }}>{children}</div>
  );
}

function Panel({ children, style, glow = C.cyan }) {
  return (
    <div style={{
      background: `linear-gradient(180deg, ${C.panel}F2, #080C18F2)`, border: `1px solid ${C.line}`, borderRadius: 22,
      boxShadow: `0 30px 80px #00000099, 0 0 0 1px #FFFFFF08 inset, 0 0 60px ${glow}14`, ...style
    }}>{children}</div>
  );
}

function Captions() {
  const f = useCurrentFrame();
  const scene = timeline.scenes.find(s => f >= s.from && f < s.from + s.frames);
  if (scene?.id === 'close') return null;
  const cue = timeline.captions.find(c => f >= c.from && f < c.to + 6);
  if (!cue) return null;
  const k = interpolate(f, [cue.from, cue.from + 6, cue.to, cue.to + 6], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: 'absolute', bottom: 46, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: k }}>
      <div style={{
        maxWidth: 1500, padding: '12px 28px', borderRadius: 14, background: '#05070ECC', border: `1px solid ${C.line}`,
        fontFamily: SANS, fontSize: 34, fontWeight: 500, color: C.ink, textAlign: 'center', lineHeight: 1.4
      }}>{cue.text}</div>
    </div>
  );
}

function Chrome() {
  const f = useCurrentFrame();
  const index = timeline.scenes.findIndex(s => f >= s.from && f < s.from + s.frames);
  const labels = ['Versions', 'Overview', 'Orchestration', 'Human gates', 'Invalidation', 'Recovery', 'Evidence', 'Outputs', 'Principle'];
  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, height: 4, width: `${(f / timeline.total_frames) * 100}%`, background: `linear-gradient(90deg, ${C.cyan}, ${C.violet})` }} />
      <div style={{ position: 'absolute', top: 34, left: 56, fontFamily: MONO, fontSize: 20, color: C.muted, letterSpacing: 2 }}>
        <span style={{ color: C.cyan, fontWeight: 700 }}>ROK</span> / {String(index + 1).padStart(2, '0')} · {labels[index]?.toUpperCase()}
      </div>
      <div style={{ position: 'absolute', top: 34, right: 56, fontFamily: MONO, fontSize: 20, color: C.dim, letterSpacing: 2 }}>RESEARCH ORCHESTRATOR KIT · v0.5</div>
    </>
  );
}

/* ---------- 1. versions ---------- */

function Versions({ d }) {
  const f = useCurrentFrame();
  const names = ['계획서_최종.docx', '계획서_최종_진짜.docx', '계획서_최종수정본(2).docx', '계획서_final_FINAL_v3.docx', '계획서_교수님피드백반영.docx'];
  const broken = t(f, d * 0.5, d * 0.58);
  return (
    <SceneFrame duration={d}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        {names.map((name, i) => {
          const k = pop(f, 8 + i * 20);
          const shake = broken > 0 && broken < 1 ? Math.sin(f * 2.3 + i) * 6 : 0;
          return (
            <Panel key={name} glow={broken ? C.red : C.blue} style={{
              position: 'absolute', width: 470, height: 270, padding: 30,
              transform: `translate(${(i - 2) * 230 + shake}px, ${60 + (i % 2) * 70 - (1 - k) * 220}px) rotate(${(i - 2) * 4}deg) scale(${mix(0.85, 1, k)})`,
              opacity: k, borderColor: mix(0, 1, broken) > 0.5 ? `${C.red}88` : C.line
            }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>{[0, 1, 2].map(j => <div key={j} style={{ width: 12, height: 12, borderRadius: 6, background: C.line }} />)}</div>
              {[0.92, 0.7, 0.84, 0.55].map((w, j) => <div key={j} style={{ height: 12, width: `${w * 100}%`, borderRadius: 6, background: '#1E2945', marginBottom: 14 }} />)}
              <div style={{ marginTop: 18, fontSize: 24, fontWeight: 700 }}>{name}</div>
              <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 18, color: broken > 0.5 ? C.red : C.muted }}>sha256 {short(hex(name))}</div>
            </Panel>
          );
        })}
      </AbsoluteFill>
      <Headline at={d * 0.52} top={110} sub="같은 계획서라고 믿었던 다섯 개의 다른 파일">버전이 바뀌는 순간, <span style={{ color: C.red }}>근거가 어긋납니다</span></Headline>
    </SceneFrame>
  );
}

/* ---------- 2. title ---------- */

function Title({ d }) {
  const f = useCurrentFrame();
  const ring = PLAN + PLAN2.slice(0, 16);
  const words = ['Research', 'Orchestrator', 'Kit'];
  const steps = ['아이디어', '계획서', '문헌 근거', '보완본'];
  const lock = t(f, d * 0.62, d * 0.72);
  return (
    <SceneFrame duration={d}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', width: 900, height: 900, transform: `translateY(-70px) rotate(${f * 0.18}deg)` }}>
          {ring.split('').map((ch, i) => {
            const a = (i / ring.length) * Math.PI * 2;
            const on = t(f, i * 0.6, i * 0.6 + 10);
            return <div key={i} style={{ position: 'absolute', left: 450 + Math.cos(a) * 400 - 9, top: 450 + Math.sin(a) * 400 - 14, fontFamily: MONO, fontSize: 24, color: i % 9 === 0 ? C.cyan : C.dim, opacity: on, transform: `rotate(${(a * 180) / Math.PI + 90}deg)` }}>{ch}</div>;
          })}
        </div>
        <div style={{ position: 'absolute', top: 300, width: '100%', textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: 24, color: C.cyan, letterSpacing: 6, opacity: t(f, 6, 24) }}>LOCAL-FIRST · HASH-BOUND · HUMAN-GATED</div>
          <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center', gap: 28 }}>
            {words.map((w, i) => {
              const k = pop(f, 14 + i * 9, { damping: 20 });
              return <span key={w} style={{ fontSize: 118, fontWeight: 900, letterSpacing: -4, opacity: k, filter: `blur(${(1 - k) * 12}px)`, transform: `translateY(${(1 - k) * 30}px)`, display: 'inline-block', color: i === 1 ? C.cyan : C.ink }}>{w}</span>;
            })}
          </div>
        </div>
        <div style={{ position: 'absolute', top: 600, display: 'flex', alignItems: 'center', gap: 18 }}>
          {steps.map((s, i) => {
            const k = pop(f, d * 0.38 + i * 9);
            return (
              <React.Fragment key={s}>
                <div style={{ opacity: k, transform: `scale(${mix(0.8, 1, k)})`, padding: '16px 28px', borderRadius: 16, fontSize: 32, fontWeight: 700, border: `1.5px solid ${lock > 0.5 ? C.cyan : C.line}`, background: '#0C1222', boxShadow: lock > 0.5 ? `0 0 30px ${C.cyan}44` : 'none' }}>{s}</div>
                {i < steps.length - 1 && <div style={{ width: 50, height: 2, background: C.dim, opacity: k }} />}
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ position: 'absolute', top: 735, opacity: lock, transform: `translateY(${(1 - lock) * 20}px)` }}>
          <Chip color={C.cyan}>🔒 plan.md · sha256 {short(PLAN)}</Chip>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
}

/* ---------- 3. agents ---------- */

function Agents({ d }) {
  const f = useCurrentFrame();
  const hub = { x: 960, y: 560 };
  const nodes = [
    { name: '공부', en: 'study', x: 470, y: 330, color: C.blue },
    { name: '연구', en: 'research', x: 1450, y: 330, color: C.violet },
    { name: '문헌', en: 'literature', x: 470, y: 790, color: C.amber },
    { name: '영상', en: 'video', x: 1450, y: 790, color: C.green }
  ];
  const draw = t(f, 10, 50);
  return (
    <SceneFrame duration={d}>
      <Headline at={0} size={60} top={86}>다섯 역할, <span style={{ color: C.cyan }}>하나의 상태</span></Headline>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        {nodes.map(n => <line key={n.en} x1={hub.x} y1={hub.y} x2={mix(hub.x, n.x, draw)} y2={mix(hub.y, n.y, draw)} stroke={`${n.color}66`} strokeWidth={2} strokeDasharray="8 10" strokeDashoffset={-f} />)}
      </svg>
      {nodes.map((n, i) => {
        const start = d * 0.22 + i * d * 0.13;
        const travel = t(f, start, start + 26);
        const back = t(f, start + 40, start + 62);
        const arrived = travel >= 1;
        const done = back >= 1;
        const k = pop(f, 18 + i * 6);
        return (
          <React.Fragment key={n.en}>
            {travel > 0 && travel < 1 && (
              <div style={{ position: 'absolute', left: mix(hub.x, n.x, travel) - 130, top: mix(hub.y, n.y, travel) - 24 }}>
                <Chip color={n.color} style={{ fontSize: 18 }}>handoff · {short(hex(n.en))}</Chip>
              </div>
            )}
            {back > 0 && back < 1 && (
              <div style={{ position: 'absolute', left: mix(n.x, hub.x, back) - 90, top: mix(n.y, hub.y, back) - 24 }}>
                <Chip color={C.green} style={{ fontSize: 18 }}>receipt ✓</Chip>
              </div>
            )}
            <div style={{ position: 'absolute', left: n.x - 170, top: n.y - 80, width: 340, opacity: k, transform: `scale(${mix(0.8, 1, k)})` }}>
              <Panel glow={n.color} style={{ padding: '22px 26px', borderColor: arrived ? n.color : C.line, boxShadow: arrived ? `0 0 50px ${n.color}44` : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 40, fontWeight: 900 }}>{n.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 18, color: n.color }}>{n.en}</div>
                </div>
                <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 18, color: done ? C.green : arrived ? n.color : C.dim }}>
                  {done ? '● completed · hash ✓' : arrived ? '● running · token' : '○ idle'}
                </div>
              </Panel>
            </div>
          </React.Fragment>
        );
      })}
      <div style={{ position: 'absolute', left: hub.x - 170, top: hub.y - 110, width: 340, height: 220, borderRadius: 999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle, #13203F, #0A0F1D)`, border: `2px solid ${C.cyan}`, boxShadow: `0 0 ${50 + Math.sin(f / 8) * 20}px ${C.cyan}55` }}>
        <div style={{ fontSize: 44, fontWeight: 900 }}>기획팀장</div>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.cyan, marginTop: 4 }}>orchestrator</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 920, display: 'flex', justifyContent: 'center', gap: 14, opacity: t(f, d * 0.75, d * 0.82) }}>
        {['goal', 'user decisions', 'input versions', 'unresolved', 'next action', 'completion'].map(x => <Chip key={x} color={C.muted} style={{ fontSize: 18, padding: '6px 14px' }}>{x}</Chip>)}
      </div>
    </SceneFrame>
  );
}

/* ---------- 4. gates ---------- */

function Typed({ text, start, f, speed = 1.4 }) {
  const n = Math.max(0, Math.min(text.length, Math.floor((f - start) * speed)));
  return <>{text.slice(0, n)}{n < text.length && f >= start ? <span style={{ color: C.cyan }}>▌</span> : null}</>;
}

function Gates({ d }) {
  const f = useCurrentFrame();
  const items = [
    { label: '아이디어' }, { label: '계획서 v1' }, { label: '수집 승인', gate: true }, { label: '문헌 수집' },
    { label: '근거 검토' }, { label: '반영 승인', gate: true }, { label: '보완본 v2' }
  ];
  const x0 = 170, gap = 263, y = 400;
  const g1 = d * 0.42, g2 = d * 0.78;
  const stops = [[0, 0], [d * 0.08, 1], [d * 0.16, 2], [g1 + 8, 2], [g1 + 30, 3], [d * 0.56, 4], [d * 0.62, 5], [g2 + 8, 5], [g2 + 30, 6]];
  let pos = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const [fa, pa] = stops[i];
    const [fb, pb] = stops[i + 1];
    if (f >= fa) pos = mix(pa, pb, t(f, fa, fb));
  }
  const open = [f >= g1, f >= g2];
  const term1 = t(f, d * 0.18, d * 0.22) * (1 - t(f, g1 + 20, g1 + 30));
  const term2 = t(f, d * 0.63, d * 0.66) * (1 - t(f, g2 + 20, g2 + 30));
  const hash = f > g2 + 30 ? PLAN2 : PLAN;
  return (
    <SceneFrame duration={d}>
      <Headline at={0} size={58} top={86} sub="승인은 터미널에서 사람이 직접 · 점수는 계획서에 묶인 품질 보고서에서만">사람이 승인한 <span style={{ color: C.amber }}>바로 그 버전</span>에서만</Headline>
      <div style={{ position: 'absolute', left: x0, right: 1920 - (x0 + gap * 6), top: y + 4, height: 2, background: C.line }} />
      <div style={{ position: 'absolute', left: x0, top: y + 4, height: 2, width: pos * gap, background: `linear-gradient(90deg, ${C.cyan}, ${C.violet})` }} />
      {items.map((item, i) => {
        const x = x0 + i * gap;
        const gateIndex = item.gate ? (i === 2 ? 0 : 1) : -1;
        const isOpen = gateIndex >= 0 && open[gateIndex];
        const color = gateIndex >= 0 ? (isOpen ? C.green : C.amber) : pos >= i - 0.05 ? C.cyan : C.dim;
        return (
          <div key={item.label} style={{ position: 'absolute', left: x - 110, top: y - 40, width: 220, textAlign: 'center' }}>
            {item.gate ? (
              <div style={{ margin: '0 auto', width: 82, height: 82, transform: `rotate(45deg) scale(${isOpen ? 1 + 0.15 * (1 - t(f, (gateIndex ? g2 : g1), (gateIndex ? g2 : g1) + 14)) : 1})`, border: `3px solid ${color}`, borderRadius: 14, background: `${color}22`, boxShadow: `0 0 40px ${color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ transform: 'rotate(-45deg)', fontSize: 34 }}>{isOpen ? '✓' : '🔒'}</div>
              </div>
            ) : (
              <div style={{ margin: '14px auto', width: 30, height: 30, borderRadius: 15, background: color, boxShadow: `0 0 24px ${color}` }} />
            )}
            <div style={{ marginTop: item.gate ? 26 : 12, fontSize: 28, fontWeight: 700, color: item.gate ? color : C.ink }}>{item.label}</div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: x0 + pos * gap - 120, top: y - 120 }}>
        <Chip color={hash === PLAN ? C.cyan : C.violet}>plan {short(hash)}</Chip>
      </div>
      {[[term1, x0 + 2 * gap, 'collection', ['- 계획서: workspace/plan.md', `  sha256 ${short(PLAN)}`, `- quality-report · plan ${PLAN.slice(0, 8)} · 10/10 ✓`], d * 0.24, g1 - 26],
        [term2, x0 + 5 * gap, 'revision', ['- 검토 보고서: review-report.md', '- 반영 항목: R1, R3', '- 승인자: 연구자'], d * 0.665, g2 - 26]].map(([k, cx, kind, lines, start, typeAt]) => k > 0 && (
        <div key={kind} style={{ position: 'absolute', left: Math.min(1920 - 980, Math.max(60, cx - 460)), top: 560, width: 920, opacity: k, transform: `translateY(${(1 - k) * 30}px)` }}>
          <Panel glow={C.amber} style={{ padding: '0 0 22px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 9, padding: '14px 18px', background: '#0F172A', borderBottom: `1px solid ${C.line}` }}>
              {[C.red, C.amber, C.green].map(c => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
              <div style={{ marginLeft: 12, fontFamily: MONO, fontSize: 16, color: C.dim }}>interactive terminal · TTY</div>
            </div>
            <div style={{ padding: '18px 26px 0', fontFamily: MONO, fontSize: 24, lineHeight: 1.6, color: C.ink }}>
              <div><span style={{ color: C.green }}>$</span> <Typed text={`rok approve ${kind}`} start={start} f={f} /></div>
              {lines.map((line, j) => <div key={j} style={{ color: C.muted, opacity: t(f, start + 22 + j * 6, start + 30 + j * 6) }}>{line}</div>)}
              <div style={{ opacity: t(f, typeAt - 18, typeAt - 10) }}>확인하려면 APPROVE를 입력하세요: <span style={{ color: C.amber }}><Typed text="APPROVE" start={typeAt} f={f} speed={0.6} /></span></div>
            </div>
          </Panel>
        </div>
      ))}
    </SceneFrame>
  );
}

/* ---------- 5. invalidate ---------- */

function Invalidate({ d }) {
  const f = useCurrentFrame();
  const edit = d * 0.2;
  const scramble = t(f, d * 0.24, d * 0.42);
  const voidAt = d * 0.46;
  const voided = f >= voidAt;
  const shake = voided && f < voidAt + 14 ? Math.sin(f * 3) * 10 : 0;
  return (
    <SceneFrame duration={d}>
      <Headline at={0} size={64} top={90}>한 글자 = 새 해시 = <span style={{ color: C.red }}>승인 무효</span></Headline>
      <Panel style={{ position: 'absolute', left: 150, top: 270, width: 760, height: 560, padding: 40 }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.dim, marginBottom: 26 }}>workspace/plan.md</div>
        <div style={{ fontSize: 30, fontWeight: 700, marginBottom: 22 }}>2. 연구문제</div>
        <div style={{ fontSize: 28, lineHeight: 1.7, color: C.muted }}>
          연구문제 1. 초등 교사의 전문적 정체성
          <span style={{ background: f >= edit ? `${C.red}44` : 'transparent', color: f >= edit ? C.ink : C.muted, borderRadius: 6, padding: '0 4px', outline: f >= edit - 12 && f < edit ? `2px solid ${C.cyan}` : 'none' }}>{f >= edit ? '이' : '은'}</span>
          {' '}수업 설계 과정에서 어떻게 형성되는가?
        </div>
        {[0.95, 0.8, 0.88, 0.6, 0.75].map((w, j) => <div key={j} style={{ height: 14, width: `${w * 100}%`, borderRadius: 7, background: '#1A2440', marginTop: 22 }} />)}
      </Panel>
      <div style={{ position: 'absolute', left: 1000, top: 290, width: 780 }}>
        <div style={{ fontFamily: MONO, fontSize: 22, color: C.muted, marginBottom: 14 }}>sha256(plan.md)</div>
        <div style={{ fontFamily: MONO, fontSize: 31, lineHeight: 1.5, wordBreak: 'break-all', color: scramble >= 1 ? C.violet : C.cyan }}>
          {scrambled(PLAN, PLAN2, scramble, 'inv')}
        </div>
        <div style={{ marginTop: 52, transform: `translateX(${shake}px)` }}>
          <Panel glow={voided ? C.red : C.green} style={{ padding: '24px 30px', borderColor: voided ? C.red : C.green }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: voided ? C.red : C.green, textDecoration: voided ? 'line-through' : 'none' }}>수집 승인 {voided ? '' : '✓'}</div>
              <div style={{ fontFamily: MONO, fontSize: 20, color: C.muted }}>plan {PLAN.slice(0, 8)}</div>
            </div>
            <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 20, color: voided ? C.red : C.dim, opacity: voided ? 1 : 0.6 }}>
              {voided ? 'stale → 새 계획서로 다시 승인해야 합니다' : 'approved_by: 연구자'}
            </div>
          </Panel>
        </div>
      </div>
    </SceneFrame>
  );
}

/* ---------- 6. recovery ---------- */

function Recovery({ d }) {
  const f = useCurrentFrame();
  const cards = [
    ['rok rework <task> --feedback', '피드백과 함께 계획서 · 검토 보고서를 되돌립니다', C.violet],
    ['rok release <task>', '응답 없는 에이전트의 작업을 회수 · 72시간 lease', C.amber],
    ['state.lock', '비정상 종료 뒤 남은 잠금을 다음 명령이 스스로 정리', C.blue],
    ['rok retry --rebind', '바뀐 입력만 다시 묶고, 승인된 계획서는 지킵니다', C.cyan]
  ];
  return (
    <SceneFrame duration={d}>
      <Headline at={0} size={64} top={90} sub="실패를 숨기지 않고, 멈춘 자리에서 다시 시작합니다">막다른 길은 <span style={{ color: C.green }}>없습니다</span></Headline>
      <div style={{ position: 'absolute', left: 150, right: 150, top: 330, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 34 }}>
        {cards.map(([cmd, desc, color], i) => {
          const start = d * 0.14 + i * d * 0.15;
          const k = pop(f, start);
          const fixed = t(f, start + 26, start + 40);
          const dot = fixed > 0.5 ? C.green : C.red;
          return (
            <Panel key={cmd} glow={color} style={{ padding: '30px 34px', opacity: k, transform: `translateY(${(1 - k) * 40}px) scale(${mix(0.94, 1, k)})`, borderColor: fixed > 0.5 ? `${color}99` : C.line }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: dot, boxShadow: `0 0 18px ${dot}` }} />
                <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color }}>{cmd}</div>
              </div>
              <div style={{ marginTop: 16, fontSize: 28, color: C.ink, lineHeight: 1.45 }}>{desc}</div>
              <div style={{ marginTop: 18, fontFamily: MONO, fontSize: 18, color: fixed > 0.5 ? C.green : C.red }}>{fixed > 0.5 ? 'resolved · state recoverable' : 'stuck'}</div>
            </Panel>
          );
        })}
      </div>
    </SceneFrame>
  );
}

/* ---------- 7. evidence ---------- */

function Evidence({ d }) {
  const f = useCurrentFrame();
  const rows = [
    ['C1', '연구문제의 이론적 배경', 'PDF 12쪽 · 원문 대조', '원문 확인', C.green],
    ['C2', '선행연구의 공백', '파싱본 4쪽', '파싱 확인', C.cyan],
    ['C3', '측정 도구의 타당도', '초록', '메타데이터만', C.amber],
    ['C4', '기대 효과', '—', '미확인', C.red]
  ];
  return (
    <SceneFrame duration={d}>
      <Headline at={0} size={60} top={90}>모든 주장에 <span style={{ color: C.cyan }}>근거 상태</span>를</Headline>
      <Panel style={{ position: 'absolute', left: 200, right: 200, top: 260, padding: '26px 40px' }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.dim, marginBottom: 18 }}>claim-ledger.json · plan {PLAN.slice(0, 8)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 420px 280px', fontSize: 22, color: C.muted, paddingBottom: 12, borderBottom: `1px solid ${C.line}` }}>
          <div>ID</div><div>주장</div><div>확인 위치</div><div>검증 상태</div>
        </div>
        {rows.map(([id, claim, where, status, color], i) => {
          const k = pop(f, d * 0.12 + i * d * 0.12);
          const p = pop(f, d * 0.12 + i * d * 0.12 + 10, { damping: 10 });
          return (
            <div key={id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 420px 280px', alignItems: 'center', padding: '20px 0', borderBottom: `1px solid ${C.line}`, opacity: k, transform: `translateX(${(1 - k) * -30}px)` }}>
              <div style={{ fontFamily: MONO, fontSize: 24, color: C.dim }}>{id}</div>
              <div style={{ fontSize: 30, fontWeight: 700 }}>{claim}</div>
              <div style={{ fontFamily: MONO, fontSize: 22, color: C.muted }}>{where}</div>
              <div style={{ transform: `scale(${p})` }}><Chip color={color} style={{ fontFamily: SANS, fontSize: 24 }}>{status}</Chip></div>
            </div>
          );
        })}
      </Panel>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 850, textAlign: 'center', fontSize: 36, fontWeight: 700, opacity: t(f, d * 0.62, d * 0.7) }}>
        자동 검사 · AI 평가 · 사람 평가는 <span style={{ color: C.amber }}>서로 다른 기록</span>으로 남습니다
      </div>
    </SceneFrame>
  );
}

/* ---------- 8. outputs ---------- */

function Outputs({ d }) {
  const f = useCurrentFrame();
  const change = d * 0.5;
  const changed = f >= change;
  const regen = t(f, change + 6, change + 36);
  const source = changed ? PLAN2 : PLAN;
  const Doc = ({ name, x, y, color, k }) => (
    <Panel glow={color} style={{ position: 'absolute', left: x, top: y, width: 420, padding: '26px 30px', opacity: k, transform: `translateX(${(1 - k) * 40}px)` }}>
      <div style={{ fontSize: 36, fontWeight: 900, color }}>{name}</div>
      <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 19, color: C.muted }}>source {short(changed && regen < 1 ? PLAN : source)}</div>
      <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 19, color: changed ? (regen < 1 ? C.amber : C.green) : C.green }}>
        {changed ? (regen < 1 ? `↻ 다시 생성 중 ${Math.round(regen * 100)}%` : '✓ 원본과 일치') : '✓ 원본과 일치'}
      </div>
    </Panel>
  );
  const arrow = t(f, 20, 44);
  return (
    <SceneFrame duration={d}>
      <Headline at={0} size={60} top={90}>원본은 하나, <span style={{ color: C.violet }}>파생은 언제든 다시</span></Headline>
      <Panel glow={C.cyan} style={{ position: 'absolute', left: 260, top: 400, width: 520, padding: '34px 38px', borderColor: changed ? C.violet : C.cyan }}>
        <div style={{ fontSize: 44, fontWeight: 900 }}>plan.md</div>
        <div style={{ marginTop: 6, fontSize: 24, color: C.muted }}>승인 대상 원본 · Markdown</div>
        <div style={{ marginTop: 16, fontFamily: MONO, fontSize: 21, color: changed ? C.violet : C.cyan }}>sha256 {short(source)}</div>
      </Panel>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        {[350, 640].map(y2 => <path key={y2} d={`M 790 500 C 960 500, 980 ${y2 + 60}, ${mix(790, 1160, arrow)} ${mix(500, y2 + 60, arrow)}`} stroke={C.dim} strokeWidth={2.5} fill="none" strokeDasharray="10 10" strokeDashoffset={-f} />)}
      </svg>
      <Doc name="plan.docx" x={1180} y={330} color={C.blue} k={pop(f, 30)} />
      <Doc name="plan.hwpx" x={1180} y={620} color={C.amber} k={pop(f, 42)} />
      <div style={{ position: 'absolute', left: 260, top: 640, opacity: t(f, d * 0.7, d * 0.78) }}>
        <Chip color={C.green}>document-manifest.json · hashes recorded</Chip>
      </div>
    </SceneFrame>
  );
}

/* ---------- 9. close ---------- */

function Close({ d }) {
  const f = useCurrentFrame();
  const l1 = t(f, 6, 26);
  const l2 = t(f, d * 0.28, d * 0.28 + 20);
  const up = t(f, d * 0.56, d * 0.68);
  const mark = pop(f, d * 0.6, { damping: 20 });
  return (
    <SceneFrame duration={d}>
      <AbsoluteFill style={{ background: `rgba(0,0,0,${0.55 * t(f, 0, 20)})` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: mix(380, 230, up), textAlign: 'center' }}>
        <div style={{ fontSize: mix(78, 54, up), fontWeight: 900, opacity: l1, letterSpacing: -2 }}>판단은 연구자에게.</div>
        <div style={{ fontSize: mix(78, 54, up), fontWeight: 900, opacity: l2, letterSpacing: -2, color: C.cyan, marginTop: 14 }}>기록은 오케스트레이터에게.</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 560, textAlign: 'center', opacity: mark, transform: `translateY(${(1 - mark) * 30}px)` }}>
        <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: -4 }}>Research <span style={{ color: C.cyan }}>Orchestrator</span> Kit</div>
        <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center', gap: 18 }}>
          <Chip color={C.green}>$ rok new</Chip>
          <Chip color={C.muted}>github.com/yangyeontae-blip/research-orchestrator-kit</Chip>
        </div>
      </div>
    </SceneFrame>
  );
}

/* ---------- composition ---------- */

const SCENES = { versions: Versions, title: Title, agents: Agents, gates: Gates, invalidate: Invalidate, recovery: Recovery, evidence: Evidence, outputs: Outputs, close: Close };

function Sounds() {
  const gates = timeline.scenes.find(s => s.id === 'gates');
  const inval = timeline.scenes.find(s => s.id === 'invalidate');
  const close = timeline.scenes.find(s => s.id === 'close');
  const cues = [
    ...timeline.scenes.slice(1).map(s => ['whoosh', s.from, 0.22]),
    ['chime', gates.from + Math.round(gates.frames * 0.42), 0.35],
    ['chime', gates.from + Math.round(gates.frames * 0.78), 0.35],
    ['deny', inval.from + Math.round(inval.frames * 0.46), 0.55],
    ['chime', close.from + Math.round(close.frames * 0.6), 0.3]
  ];
  return (
    <>
      <Audio src={staticFile('pad.mp3')} volume={0.3} />
      {timeline.scenes.map(s => <Sequence key={s.id} from={s.from + s.lead_frames}><Audio src={staticFile(s.voice)} /></Sequence>)}
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

registerRoot(() => (
  <Composition id="RokOrchestration" component={Video} durationInFrames={timeline.total_frames} fps={FPS} width={1920} height={1080} />
));
