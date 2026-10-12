import React from 'react';
import {
  AbsoluteFill, Audio, Composition, Easing, OffthreadVideo, Sequence, interpolate, registerRoot, spring, staticFile, useCurrentFrame
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

function Headline({ children, at = 0, size = 64, top = 92, sub }) {
  const f = useCurrentFrame();
  const k = t(f, at, at + 20);
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, textAlign: 'center', opacity: k, transform: `translateY(${(1 - k) * 22}px)` }}>
      <div style={{ fontSize: size, fontWeight: 900, letterSpacing: -2, lineHeight: 1.15 }}>{children}</div>
      {sub && <div style={{ marginTop: 12, fontSize: 28, color: C.muted, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

function Chip({ children, color = C.cyan, style }) {
  return <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 999, border: `1.5px solid ${color}`, background: `${color}14`, color, fontFamily: MONO, fontSize: 22, fontWeight: 700, boxShadow: `0 0 26px ${color}33`, whiteSpace: 'nowrap', ...style }}>{children}</div>;
}

function Panel({ children, style, glow = C.cyan }) {
  return <div style={{ background: `linear-gradient(180deg, ${C.panel}F2, #080C18F2)`, border: `1px solid ${C.line}`, borderRadius: 22, boxShadow: `0 30px 80px #00000099, 0 0 0 1px #FFFFFF08 inset, 0 0 60px ${glow}14`, ...style }}>{children}</div>;
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
  const labels = ['Relay', 'v0.6', 'Run scope', 'Execution', 'Literature', 'Evidence', 'Blueprint', 'Recovery', 'Judgment', 'Principle'];
  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, height: 4, width: `${(f / timeline.total_frames) * 100}%`, background: `linear-gradient(90deg, ${C.cyan}, ${C.violet})` }} />
      <div style={{ position: 'absolute', top: 34, left: 56, fontFamily: MONO, fontSize: 20, color: C.muted, letterSpacing: 2 }}>
        <span style={{ color: C.cyan, fontWeight: 700 }}>ROK</span> / {String(index + 1).padStart(2, '0')} · {labels[index]?.toUpperCase()}
      </div>
      <div style={{ position: 'absolute', top: 34, right: 56, fontFamily: MONO, fontSize: 20, color: C.dim, letterSpacing: 2 }}>RESEARCH ORCHESTRATOR KIT · v0.6 · 합성 예시</div>
    </>
  );
}

function Typed({ text, start, f, speed = 1.3 }) {
  const n = Math.max(0, Math.min(text.length, Math.floor((f - start) * speed)));
  return <>{text.slice(0, n)}{n < text.length && f >= start ? <span style={{ color: C.cyan }}>▌</span> : null}</>;
}

/* ---------- 1. relay ---------- */

function Relay({ d }) {
  const f = useCurrentFrame();
  const windows = [['기획 채팅', 300, 250], ['공부 채팅', 1120, 250], ['연구 채팅', 300, 560], ['문헌 폴더', 1120, 560]];
  const files = ['plan_final.md', 'notes_v3.txt', 'refs(2).bib', 'plan_최종_진짜.docx', 'review.md', 'paper.pdf'];
  const stopped = f > d * 0.42 && f < d * 0.62;
  const counter = (rate, start = 0) => Math.max(0, Math.floor((f - start) / rate));
  return (
    <SceneFrame duration={d}>
      {windows.map(([title, x, y], i) => {
        const k = pop(f, i * 5);
        const warn = stopped && i === 2;
        return (
          <Panel key={title} glow={warn ? C.red : C.blue} style={{ position: 'absolute', left: x, top: y, width: 500, height: 250, padding: 24, opacity: k, transform: `scale(${mix(0.9, 1, k)})`, borderColor: warn ? C.red : C.line }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{title}</div>
              <div style={{ display: 'flex', gap: 8 }}>{[C.red, C.amber, C.green].map(c => <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}</div>
            </div>
            {[0.9, 0.7, 0.8].map((w, j) => <div key={j} style={{ height: 12, width: `${w * 100}%`, borderRadius: 6, background: '#1E2945', marginTop: 22 }} />)}
            {warn && <div style={{ marginTop: 22, fontFamily: MONO, fontSize: 22, color: C.red }}>✕ 작업 중단됨 · 어디까지 했더라?</div>}
          </Panel>
        );
      })}
      {files.map((name, i) => {
        const cycle = 46;
        const local = (f + i * 17) % cycle;
        const [a, b] = [[0, 1], [1, 3], [3, 2], [2, 0], [0, 3], [1, 2]][i];
        const k = t(local, 0, cycle - 6);
        const from = windows[a], to = windows[b];
        return <div key={name} style={{ position: 'absolute', left: mix(from[1], to[1], k) + 140, top: mix(from[2], to[2], k) + 110, opacity: interpolate(local, [0, 6, cycle - 10, cycle - 4], [0, 1, 1, 0], clamp) }}><Chip color={[C.cyan, C.violet, C.amber, C.blue, C.green, C.muted][i]} style={{ fontSize: 18 }}>{name}</Chip></div>;
      })}
      <div style={{ position: 'absolute', right: 70, bottom: 150, textAlign: 'right', fontFamily: MONO, fontSize: 22, color: C.muted, lineHeight: 1.7 }}>
        <div>복사·붙여넣기 <span style={{ color: C.ink }}>{counter(4)}</span>회</div>
        <div>파일 버전 <span style={{ color: C.ink }}>{1 + counter(30)}</span>개</div>
        <div>다시 시작 <span style={{ color: C.red }}>{counter(90, 40)}</span>회</div>
      </div>
      <Headline at={d * 0.6} top={90} size={60}>옮기고, 맞추고, <span style={{ color: C.red }}>되살리는 시간</span></Headline>
    </SceneFrame>
  );
}

/* ---------- 2. title ---------- */

function Title({ d }) {
  const f = useCurrentFrame();
  const l = pop(f, 6, { damping: 20 }), r = pop(f, 22, { damping: 20 }), w = t(f, d * 0.5, d * 0.62);
  return (
    <SceneFrame duration={d}>
      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 60 }}>
        <div style={{ fontSize: 104, fontWeight: 900, letterSpacing: -4, opacity: l, filter: `blur(${(1 - l) * 10}px)`, transform: `translateX(${(1 - l) * -40}px)` }}>연구자는 판단하고</div>
        <div style={{ fontSize: 104, fontWeight: 900, letterSpacing: -4, color: C.cyan, opacity: r, filter: `blur(${(1 - r) * 10}px)`, transform: `translateX(${(1 - r) * 40}px)` }}>에이전트는 실행한다</div>
      </div>
      <div style={{ position: 'absolute', top: 520, left: 0, right: 0, textAlign: 'center', opacity: w, transform: `translateY(${(1 - w) * 20}px)` }}>
        <div style={{ fontSize: 46, fontWeight: 700, color: C.muted }}>Research Orchestrator Kit <span style={{ color: C.ink }}>0.6</span></div>
        <div style={{ marginTop: 34, display: 'flex', justifyContent: 'center', gap: 14 }}>
          {['rok run', 'resume', 'stop', 'doctor', 'blueprint'].map((c, i) => <div key={c} style={{ opacity: t(f, d * 0.6 + i * 4, d * 0.66 + i * 4) }}><Chip color={i ? C.muted : C.green}>{i ? c : '$ ' + c}</Chip></div>)}
        </div>
      </div>
    </SceneFrame>
  );
}

/* ---------- 3. run scope ---------- */

function Scope({ d }) {
  const f = useCurrentFrame();
  const rows = [
    ['목적 · 형식', '가상 초임 교사 자문화기술지 · APA 7 · 마감 12/31'],
    ['보낼 파일', 'study-notes.md · sha256 3fa9c1e0…6089'],
    ['검색어', '"novice teacher identity" · "online autoethnography"'],
    ['실행 도구', 'Claude Code (구독 로그인) · 동시 작업 2'],
    ['상한', '후보 50건 · 원문 15건 · 보완 2회 · AI 호출 12회'],
    ['유료 API 예산', '0원']
  ];
  const approveAt = d * 0.78;
  const pressed = f >= approveAt;
  return (
    <SceneFrame duration={d}>
      <Headline at={0} top={90} size={58}>시작할 때 <span style={{ color: C.cyan }}>한 번</span>, 범위를 확인합니다</Headline>
      <div style={{ position: 'absolute', left: 120, top: 330, width: 560, opacity: t(f, 6, 22) }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.dim, marginBottom: 12 }}>연구자 · 기획팀장 채팅</div>
        <div style={{ padding: '24px 28px', borderRadius: '24px 24px 6px 24px', background: '#1E3A8A', fontSize: 32, lineHeight: 1.5 }}>이 공부 기록으로 APA 7 계획서 만들어 줘. 마감은 12월 말이야.</div>
        <div style={{ marginTop: 22, padding: '20px 26px', borderRadius: '24px 24px 24px 6px', background: C.panel, border: `1px solid ${C.line}`, fontSize: 26, color: C.muted, lineHeight: 1.5, opacity: t(f, 30, 46) }}>오른쪽 범위로 실행할까요? 연구문제·방법이 바뀌거나 범위를 넘을 때만 다시 여쭙겠습니다.</div>
      </div>
      <Panel glow={pressed ? C.green : C.cyan} style={{ position: 'absolute', left: 760, top: 290, width: 1040, padding: '30px 38px', borderColor: pressed ? C.green : C.line }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.cyan, marginBottom: 14 }}>run-scope.json · 실행 범위</div>
        {rows.map(([k, v], i) => {
          const on = t(f, 26 + i * 12, 38 + i * 12);
          return <div key={k} style={{ display: 'grid', gridTemplateColumns: '220px 1fr', padding: '13px 0', borderBottom: `1px solid ${C.line}`, opacity: on, transform: `translateX(${(1 - on) * 20}px)` }}>
            <div style={{ fontSize: 26, color: C.muted }}>{k}</div>
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: i === 1 || i === 2 ? MONO : SANS, color: i === 5 ? C.green : C.ink }}>{v}</div>
          </div>;
        })}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', opacity: t(f, d * 0.62, d * 0.7) }}>
          <div style={{ padding: '14px 30px', borderRadius: 14, fontSize: 28, fontWeight: 900, background: pressed ? C.green : `${C.cyan}22`, color: pressed ? '#04130A' : C.cyan, border: `2px solid ${pressed ? C.green : C.cyan}`, transform: `scale(${pressed ? 1 + 0.08 * (1 - t(f, approveAt, approveAt + 10)) : 1})` }}>{pressed ? '✓ 승인됨 · 실행 시작' : '이 범위로 실행'}</div>
        </div>
      </Panel>
    </SceneFrame>
  );
}

/* ---------- 4. execution ---------- */

function Run({ d }) {
  const f = useCurrentFrame();
  const steps = [
    ['실행 범위 확인', 'scope 7c1e…a20f'],
    ['탐색 수집', 'Crossref · OpenAlex · 후보 41건'],
    ['공개 원문 확보', 'PDF 6건 파싱 · 3건 접근 불가 기록'],
    ['계획서 초안', 'claude_cli · 새 세션'],
    ['품질 보고서 · DOCX', '계획서 해시에 결속'],
    ['블루프린트', '출처 행 연결 · 미확인 1개']
  ];
  const each = (d * 0.72) / steps.length;
  const done = Math.min(steps.length, Math.floor((f - 10) / each));
  const halted = done >= steps.length;
  const calls = Math.min(3, Math.max(0, done - 2));
  return (
    <SceneFrame duration={d}>
      <Headline at={0} top={90} size={58}>범위 안에서는 <span style={{ color: C.cyan }}>멈추지 않고</span> 실행합니다</Headline>
      <Panel style={{ position: 'absolute', left: 120, top: 250, width: 1060, padding: '26px 36px' }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.dim, marginBottom: 10 }}>$ rok run</div>
        {steps.map(([title, detail], i) => {
          const state = i < done ? 'done' : i === done && !halted ? 'running' : 'wait';
          return <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '13px 0', borderBottom: `1px solid ${C.line}`, opacity: state === 'wait' ? 0.35 : 1 }}>
            <div style={{ width: 34, fontSize: 28, color: state === 'done' ? C.green : C.cyan, textAlign: 'center', transform: state === 'running' ? `rotate(${f * 12}deg)` : 'none' }}>{state === 'done' ? '✓' : state === 'running' ? '◌' : '·'}</div>
            <div style={{ width: 300, fontSize: 29, fontWeight: 700 }}>{title}</div>
            <div style={{ fontFamily: MONO, fontSize: 21, color: C.muted }}>{detail}</div>
          </div>;
        })}
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 16, opacity: t(f, 10 + steps.length * each, 22 + steps.length * each) }}>
          <div style={{ fontSize: 30, color: C.amber }}>⏸</div>
          <div style={{ fontSize: 29, fontWeight: 900, color: C.amber }}>판단 필요 · 계획서 실사용 확인</div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: C.muted }}>연구자의 차례</div>
        </div>
      </Panel>
      <div style={{ position: 'absolute', left: 1240, top: 270, width: 560, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {[['Claude Code', 'claude_cli', C.violet, true], ['Codex CLI', 'codex_cli', C.blue, false]].map(([name, id, color, active]) => (
          <Panel key={id} glow={color} style={{ padding: '24px 30px', borderColor: active && !halted ? color : C.line, opacity: active ? 1 : 0.55 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontSize: 34, fontWeight: 900 }}>{name}</div><div style={{ fontFamily: MONO, fontSize: 20, color }}>{id}</div></div>
            <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 20, color: active ? (halted ? C.amber : C.green) : C.dim }}>{active ? (halted ? '● 대기 · 연구자 판단' : '● 작업 중 · 구독 로그인') : '○ 선택 가능'}</div>
          </Panel>
        ))}
        <div style={{ display: 'flex', gap: 14 }}>
          <Chip color={C.cyan}>AI 호출 {calls} / 12</Chip>
          <Chip color={C.green}>유료 API 0원</Chip>
        </div>
      </div>
    </SceneFrame>
  );
}

/* ---------- 5. literature ---------- */

function Literature({ d }) {
  const f = useCurrentFrame();
  const stages = ['검색', '중복 제거', '공개 원문', 'PDF 확인', '제목 일치', '파싱'];
  const x0 = 170, gap = 316, y = 360;
  const docs = [
    { id: 'A', fail: null }, { id: 'B', fail: 2 }, { id: 'C', fail: null }, { id: 'D', fail: 3 }, { id: 'E', fail: 4 }, { id: 'F', fail: null }
  ];
  const bins = [[2, '접근 불가', C.amber], [3, '스캔본 · OCR 필요', C.amber], [4, '문헌 불일치', C.red]];
  return (
    <SceneFrame duration={d}>
      <Headline at={0} top={90} size={58}>서지정보에서 <span style={{ color: C.cyan }}>원문</span>까지</Headline>
      <div style={{ position: 'absolute', left: 150, top: 200, display: 'flex', gap: 12, opacity: t(f, 6, 20) }}>
        {['Crossref', 'OpenAlex', 'KCI', 'RIS · BibTeX', 'Unpaywall'].map((s, i) => <Chip key={s} color={[C.blue, C.cyan, C.violet, C.muted, C.green][i]} style={{ fontSize: 19 }}>{s}</Chip>)}
      </div>
      <div style={{ position: 'absolute', left: x0, top: y + 30, width: gap * 5, height: 2, background: C.line }} />
      {stages.map((s, i) => (
        <div key={s} style={{ position: 'absolute', left: x0 + i * gap - 90, top: y, width: 180, textAlign: 'center', opacity: t(f, 8 + i * 4, 20 + i * 4) }}>
          <div style={{ margin: '0 auto', width: 60, height: 60, borderRadius: 30, background: C.panel, border: `2px solid ${C.cyan}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 22, color: C.cyan }}>{i + 1}</div>
          <div style={{ marginTop: 12, fontSize: 26, fontWeight: 700 }}>{s}</div>
        </div>
      ))}
      {docs.map((doc, i) => {
        const start = 26 + i * 16;
        const travel = (f - start) / 70;
        const stop = doc.fail ?? 5;
        const pos = Math.max(0, Math.min(stop, travel * 5));
        const dropped = doc.fail !== null && travel * 5 >= stop;
        const drop = dropped ? t(f, start + (stop / 5) * 70, start + (stop / 5) * 70 + 16) : 0;
        if (f < start) return null;
        const binIndex = bins.findIndex(b => b[0] === doc.fail);
        const finished = doc.fail === null && pos >= 5;
        return <div key={doc.id} style={{ position: 'absolute', left: x0 + pos * gap - 26 + (finished ? ({ 0: -62, 2: 0, 5: 62 })[i] : 0), top: y + 6 + drop * (250 + binIndex * 0) + (finished ? 170 : 0) }}>
          <div style={{ width: 52, height: 64, borderRadius: 8, background: dropped ? `${bins[binIndex][2]}33` : finished ? `${C.green}33` : '#1E2945', border: `2px solid ${dropped ? bins[binIndex][2] : finished ? C.green : C.muted}`, fontFamily: MONO, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>PDF</div>
        </div>;
      })}
      {bins.map(([stage, label, color], i) => (
        <div key={label} style={{ position: 'absolute', left: x0 + stage * gap - 140, top: y + 330, width: 280, textAlign: 'center', opacity: t(f, 60 + i * 16, 74 + i * 16) }}>
          <Chip color={color} style={{ fontFamily: SANS, fontSize: 22 }}>{label}</Chip>
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 18, color }}>성공 아님 · 기록됨</div>
        </div>
      ))}
      <div style={{ position: 'absolute', left: x0 + 5 * gap - 120, top: y + 330, width: 240, textAlign: 'center', opacity: t(f, d * 0.7, d * 0.78) }}>
        <Chip color={C.green} style={{ fontFamily: SANS, fontSize: 22 }}>파싱 완료 3</Chip>
      </div>
    </SceneFrame>
  );
}

/* ---------- 6. evidence ---------- */

function Evidence({ d }) {
  const f = useCurrentFrame();
  const chain = [['주장 C2', '초임 시기의 정체성 혼란', C.ink], ['문헌', 'Kim (2021)', C.blue], ['파일', 'sha256 9b1e…40aa', C.muted], ['위치', '7쪽 · 인용 일치', C.cyan], ['관계', '지지', C.green]];
  const failAt = d * 0.62;
  const failed = f >= failAt;
  return (
    <SceneFrame duration={d}>
      <Headline at={0} top={90} size={58}>주장마다 <span style={{ color: C.cyan }}>쪽과 문장</span>까지</Headline>
      {[0, 1].map(row => {
        const y = 300 + row * 300;
        const show = row === 0 ? 0 : d * 0.45;
        return <div key={row} style={{ position: 'absolute', left: 110, right: 110, top: y, display: 'flex', alignItems: 'center', gap: 14, opacity: t(f, show, show + 14) }}>
          {chain.map(([label, value, color], i) => {
            const bad = row === 1 && i >= 3 && failed;
            const v = row === 1 ? [['주장 C3', '동료 교사의 지원 효과'], ['문헌', 'Lee (2019)'], ['파일', 'sha256 c71d…02be'], ['위치', bad ? '7쪽에 인용 없음' : '7쪽 · 확인 중'], ['관계', bad ? '불일치' : '—']][i] : [label, value];
            const k = pop(f, show + 6 + i * 6);
            return <React.Fragment key={i}>
              <Panel glow={bad ? C.red : color} style={{ flex: i === 0 ? 1.5 : 1, padding: '20px 22px', borderColor: bad ? C.red : C.line, opacity: k, transform: `scale(${mix(0.9, 1, k)}) translateX(${bad && f < failAt + 12 ? Math.sin(f * 3) * 8 : 0}px)` }}>
                <div style={{ fontFamily: MONO, fontSize: 18, color: C.dim }}>{v[0]}</div>
                <div style={{ marginTop: 8, fontSize: i === 2 ? 22 : 27, fontWeight: 700, fontFamily: i === 2 ? MONO : SANS, color: bad ? C.red : row === 0 ? color : C.ink }}>{v[1]}</div>
              </Panel>
              {i < chain.length - 1 && <div style={{ fontSize: 30, color: C.dim }}>→</div>}
            </React.Fragment>;
          })}
        </div>;
      })}
    </SceneFrame>
  );
}

/* ---------- 7. blueprint ---------- */

function Blueprint({ d }) {
  const f = useCurrentFrame();
  const k = pop(f, 0, { damping: 20 });
  const clip = 11.6 * FPS;
  const offset = Math.max(0, Math.round((d - clip) / 2));
  const progress = Math.min(1, Math.max(0, (f - offset) / clip));
  return (
    <SceneFrame duration={d}>
      <div style={{ position: 'absolute', left: 310, top: 86, width: 1300, opacity: k, transform: `translateY(${(1 - k) * 30}px)` }}>
        <Panel style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: '#0F172A', borderBottom: `1px solid ${C.line}` }}>
            {[C.red, C.amber, C.green].map(c => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
            <div style={{ marginLeft: 14, flex: 1, padding: '6px 16px', borderRadius: 8, background: C.bg, fontFamily: MONO, fontSize: 18, color: C.muted }}>127.0.0.1 · rok preview blueprint.mp4</div>
            <Chip color={C.cyan} style={{ fontSize: 16, padding: '6px 12px' }}>실제 렌더러 출력 · 합성 계획서</Chip>
          </div>
          <div style={{ width: 1300, height: 731, background: '#000' }}>
            <Sequence from={offset}><OffthreadVideo src={staticFile('blueprint-clip.mp4')} style={{ width: 1300, height: 731 }} muted /></Sequence>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px', background: '#0F172A' }}>
            <div style={{ fontSize: 22, color: C.ink }}>▶</div>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.line }}><div style={{ width: `${progress * 100}%`, height: 6, borderRadius: 3, background: C.cyan }} /></div>
            <div style={{ fontFamily: MONO, fontSize: 18, color: C.muted }}>클릭 재생 · 구간 이동 · MP4 다운로드</div>
          </div>
        </Panel>
      </div>
    </SceneFrame>
  );
}

/* ---------- 8. recovery ---------- */

function Recovery({ d }) {
  const f = useCurrentFrame();
  const steps = ['범위', '수집', '원문', '초안', '검토', '보완'];
  const limitAt = d * 0.3, resumeAt = d * 0.58;
  const progress = f < limitAt ? t(f, 8, limitAt) * 3 : f < resumeAt ? 3 : 3 + t(f, resumeAt + 20, d * 0.92) * 3;
  const limited = f >= limitAt && f < resumeAt + 20;
  return (
    <SceneFrame duration={d}>
      <Headline at={0} top={90} size={58}>멈춘 자리에서 <span style={{ color: C.green }}>다시</span></Headline>
      <div style={{ position: 'absolute', left: 200, right: 200, top: 330, display: 'flex', gap: 16 }}>
        {steps.map((s, i) => {
          const done = progress >= i + 1;
          const blocked = limited && i === 3;
          return <div key={s} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: 14, borderRadius: 7, background: done ? C.green : blocked ? C.red : C.line, boxShadow: done ? `0 0 18px ${C.green}66` : 'none' }} />
            <div style={{ marginTop: 14, fontSize: 28, fontWeight: 700, color: blocked ? C.red : done ? C.ink : C.dim }}>{s}</div>
            <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 18, color: done ? C.green : C.dim }}>{done ? '보존됨' : blocked ? '중단' : ''}</div>
          </div>;
        })}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 520, display: 'flex', justifyContent: 'center', opacity: limited ? 1 : 0, transform: `scale(${limited ? 1 : 0.96})` }}>
        <Panel glow={C.red} style={{ padding: '18px 34px', borderColor: C.red }}><div style={{ fontSize: 30, fontWeight: 900, color: C.red }}>사용량 한도 도달 · 완료한 작업은 그대로 남습니다</div></Panel>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 650, display: 'flex', justifyContent: 'center', gap: 18, opacity: t(f, resumeAt - 6, resumeAt + 6) }}>
        <Panel style={{ padding: '18px 30px', fontFamily: MONO, fontSize: 30 }}><span style={{ color: C.green }}>$</span> <Typed text="rok resume" start={resumeAt} f={f} speed={0.7} /></Panel>
        <Chip color={C.green} style={{ alignSelf: 'center' }}>유료 API 전환 없음 · 0원</Chip>
      </div>
    </SceneFrame>
  );
}

/* ---------- 9. judgment ---------- */

function Judgment({ d }) {
  const f = useCurrentFrame();
  const items = ['검토를 거친 보완본', '근거 · 방법 · 인용 검사 (현재 해시)', '계획서 실사용 확인', 'DOCX · HWPX 원본 대조', '남은 한계와 미확인 근거 기록'];
  const stampAt = d * 0.74;
  const stamp = pop(f, stampAt, { damping: 11, mass: 0.6 });
  return (
    <SceneFrame duration={d}>
      <Headline at={0} top={90} size={60}>마지막 판단은 <span style={{ color: C.cyan }}>연구자</span>에게</Headline>
      <Panel style={{ position: 'absolute', left: 150, top: 260, width: 900, padding: '24px 36px' }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.dim, marginBottom: 8 }}>rok finalize · 최종 확정에 필요한 기록</div>
        {items.map((item, i) => {
          const on = f >= 18 + i * 22;
          return <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '15px 0', borderBottom: `1px solid ${C.line}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${on ? C.green : C.dim}`, background: on ? `${C.green}22` : 'transparent', color: C.green, fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on ? '✓' : ''}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: on ? C.ink : C.dim }}>{item}</div>
          </div>;
        })}
      </Panel>
      <div style={{ position: 'absolute', left: 1140, top: 290, width: 640, textAlign: 'center' }}>
        <div style={{ opacity: t(f, 30, 46) }}>
          <div style={{ display: 'inline-block', position: 'relative', fontSize: 40, fontWeight: 900, color: C.dim }}>
            외부 평가 점수
            <div style={{ position: 'absolute', left: -10, right: -10, top: '52%', height: 5, background: C.red, transform: `scaleX(${t(f, 50, 66)})`, transformOrigin: 'left' }} />
          </div>
          <div style={{ marginTop: 10, fontSize: 24, color: C.muted }}>완료 기준이 아닙니다</div>
        </div>
        <div style={{ marginTop: 70, opacity: Math.min(1, stamp * 1.4), transform: `rotate(-6deg) scale(${mix(1.6, 1, Math.min(1, stamp))})` }}>
          <div style={{ display: 'inline-block', padding: '24px 40px', border: `6px solid ${C.cyan}`, borderRadius: 18, color: C.cyan, boxShadow: `0 0 50px ${C.cyan}55` }}>
            <div style={{ fontSize: 54, fontWeight: 900 }}>연구자 확정</div>
            <div style={{ fontFamily: MONO, fontSize: 22, marginTop: 4 }}>finalize · plan 7d02e8b4</div>
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}

/* ---------- 10. close ---------- */

function Close({ d }) {
  const f = useCurrentFrame();
  const l1 = t(f, 6, 24), l2 = t(f, d * 0.24, d * 0.24 + 18), up = t(f, d * 0.5, d * 0.62), mark = pop(f, d * 0.54, { damping: 20 });
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
          <Chip color={C.green}>$ rok run</Chip>
          <Chip color={C.muted}>github.com/yangyeontae-blip/research-orchestrator-kit</Chip>
        </div>
      </div>
    </SceneFrame>
  );
}

/* ---------- composition ---------- */

const SCENES = { relay: Relay, title: Title, scope: Scope, run: Run, literature: Literature, evidence: Evidence, blueprint: Blueprint, recovery: Recovery, judgment: Judgment, close: Close };

function Sounds() {
  const at = (id, k) => scene(id).from + Math.round(scene(id).frames * k);
  const run = scene('run');
  const cues = [
    ...timeline.scenes.slice(1).map(s => ['whoosh', s.from, 0.18]),
    ['chime', at('scope', 0.78), 0.32],
    ...[0, 1, 2, 3, 4, 5].map(i => ['tick', run.from + 10 + Math.round(((run.frames * 0.72) / 6) * (i + 1)), 0.25]),
    ['deny', at('evidence', 0.62), 0.5],
    ['deny', at('recovery', 0.3), 0.45],
    ['chime', at('recovery', 0.62), 0.25],
    ['chime', at('judgment', 0.74), 0.35],
    ['chime', at('close', 0.54), 0.25]
  ];
  return (
    <>
      <Audio src={staticFile('music.mp3')} volume={0.85} />
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

registerRoot(() => <Composition id="RokV06" component={Video} durationInFrames={timeline.total_frames} fps={FPS} width={1920} height={1080} />);
