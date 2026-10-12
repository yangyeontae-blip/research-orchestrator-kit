import React from 'react';
import {AbsoluteFill, Audio, Composition, Easing, Sequence, interpolate, registerRoot, spring, staticFile, useCurrentFrame} from 'remotion';
import {loadFont as loadSans} from '@remotion/google-fonts/NotoSansKR';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

const {fontFamily: SANS} = loadSans('normal', {weights: ['400', '700', '900']});
const {fontFamily: MONO} = loadMono('normal', {weights: ['400', '700']});
const FPS = 30;
const TITLE = 105, SECTION = 180, ALIGN = 210, GAPS = 150;
const C = {bg: '#05070E', panel: '#0C1222', line: '#1C2640', ink: '#F4F7FF', muted: '#8A97B8', dim: '#4A5675', cyan: '#5EEAD4', violet: '#A78BFA', amber: '#FBBF24', red: '#F87171', green: '#4ADE80'};
const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const fade = (f, a, b) => interpolate(f, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
const pop = (f, delay = 0) => spring({frame: f - delay, fps: FPS, config: {damping: 16, mass: 0.7}});

// Plan excerpts are Markdown; show them as plain sentences and never imply more than the excerpt says.
const clean = text => String(text || '').replace(/\*\*|__|`/g, '').replace(/^\s*[-*]\s+/gm, '· ').replace(/^#+\s*/gm, '').replace(/\n{2,}/g, '\n').trim();
const excerpt = (text, max) => { const value = clean(text); return value.length > max ? value.slice(0, max).replace(/\s+\S*$/, '') + ' …' : value; };
const confirmed = section => Boolean(section?.source);
const short = sha => sha ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : '';

function Frame({children, duration}) {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, 10, duration - 10, duration], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity, fontFamily: SANS, color: C.ink}}>{children}</AbsoluteFill>;
}

function Backdrop() {
  return <AbsoluteFill style={{background: `radial-gradient(900px 600px at 25% 15%, #1E3A8A33, transparent 70%), radial-gradient(800px 600px at 80% 90%, #5B21B633, transparent 70%), ${C.bg}`}}>
    <AbsoluteFill style={{opacity: 0.3, backgroundImage: `linear-gradient(${C.line}55 1px, transparent 1px), linear-gradient(90deg, ${C.line}55 1px, transparent 1px)`, backgroundSize: '64px 64px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)'}} />
  </AbsoluteFill>;
}

function Chip({children, color, style}) {
  return <span style={{display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, border: `1.5px solid ${color}`, background: `${color}18`, color, fontSize: 22, fontWeight: 700, whiteSpace: 'nowrap', ...style}}>{children}</span>;
}

function Header({label, plan}) {
  return <>
    <div style={{position: 'absolute', top: 34, left: 60, fontFamily: MONO, fontSize: 20, color: C.muted, letterSpacing: 2}}><span style={{color: C.cyan, fontWeight: 700}}>ROK BLUEPRINT</span> / {label}</div>
    <div style={{position: 'absolute', top: 34, right: 60, fontFamily: MONO, fontSize: 18, color: C.dim}}>plan {short(plan?.sha256)} · 계획 단계 · 연구 결과 아님</div>
  </>;
}

function Coverage({sections, current, y = 930}) {
  return <div style={{position: 'absolute', top: y, left: 60, right: 60, display: 'flex', gap: 10}}>
    {sections.map((s, i) => <div key={s.id} style={{flex: 1, textAlign: 'center'}}>
      <div style={{height: 6, borderRadius: 3, background: confirmed(s) ? (i === current ? C.cyan : `${C.cyan}66`) : (i === current ? C.amber : `${C.amber}55`)}} />
      <div style={{marginTop: 8, fontSize: 17, color: i === current ? C.ink : C.dim}}>{s.title}</div>
    </div>)}
  </div>;
}

function Title({title, plan, sections}) {
  const f = useCurrentFrame();
  const done = sections.filter(confirmed).length;
  return <Frame duration={TITLE}>
    <Header label="OVERVIEW" plan={plan} />
    <div style={{position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center', opacity: fade(f, 0, 18)}}>
      <div style={{fontFamily: MONO, fontSize: 24, letterSpacing: 6, color: C.cyan}}>RESEARCH BLUEPRINT</div>
      <div style={{marginTop: 26, fontSize: 70, fontWeight: 900, letterSpacing: -2, padding: '0 120px', lineHeight: 1.2}}>{excerpt(title, 70)}</div>
      <div style={{marginTop: 40, display: 'flex', gap: 16, justifyContent: 'center', opacity: fade(f, 20, 40)}}>
        <Chip color={C.cyan}>설계 요소 {done} / {sections.length} 확인</Chip>
        <Chip color={done === sections.length ? C.green : C.amber}>{done === sections.length ? '빠진 요소 없음' : `미확인 ${sections.length - done}개`}</Chip>
        <Chip color={C.muted}>근거 검증과 별개</Chip>
      </div>
    </div>
    <Coverage sections={sections} current={-1} />
  </Frame>;
}

function SectionScene({section, index, sections, change, plan}) {
  const f = useCurrentFrame();
  const ok = confirmed(section);
  const k = pop(f, 4);
  return <Frame duration={SECTION}>
    <Header label={`${String(index + 1).padStart(2, '0')} · ${section.title}`} plan={plan} />
    <div style={{position: 'absolute', top: 120, left: 120, right: 120, opacity: k, transform: `translateY(${(1 - k) * 24}px)`}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
        <div style={{fontFamily: MONO, fontSize: 30, color: C.dim}}>{String(index + 1).padStart(2, '0')}</div>
        <div style={{fontSize: 66, fontWeight: 900, letterSpacing: -2}}>{section.title}</div>
        <Chip color={ok ? C.cyan : C.amber}>{ok ? '계획서 발췌' : '미확인 · 설계 보강 필요'}</Chip>
        {change && <Chip color={C.violet}>보완본에서 변경</Chip>}
      </div>
      {change ? <div style={{marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28}}>
        {[['이전', change.before, C.dim], ['현재', change.after, C.violet]].map(([label, text, color]) => <div key={label} style={{padding: '26px 32px', borderRadius: 20, background: C.panel, border: `1px solid ${color}`, minHeight: 420}}>
          <div style={{fontFamily: MONO, fontSize: 20, color, marginBottom: 14}}>{label}</div>
          <div style={{fontSize: 30, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: label === '이전' ? C.muted : C.ink}}>{excerpt(text || '해당 절 없음', 190)}</div>
        </div>)}
      </div> : <div style={{marginTop: 44, padding: '34px 44px', borderRadius: 22, background: `${C.panel}EE`, border: `1px solid ${ok ? C.line : `${C.amber}88`}`, borderLeft: `8px solid ${ok ? C.cyan : C.amber}`, minHeight: 420}}>
        <div style={{fontSize: 36, lineHeight: 1.65, whiteSpace: 'pre-wrap', color: ok ? C.ink : C.amber}}>{ok ? excerpt(section.text, 260) : '계획서에서 이 요소에 해당하는 절을 찾지 못했습니다. 연구자가 보완할지 판단합니다.'}</div>
      </div>}
      <div style={{marginTop: 22, fontFamily: MONO, fontSize: 20, color: C.muted}}>{ok ? `${plan?.path?.split('/').pop()} ${section.source.start_line}–${section.source.end_line}행 · sha256 ${short(section.source.sha256)}` : '출처 없음'}{change ? ' · 변경 이유는 검토 보고서에서 확인' : ''}</div>
    </div>
    <Coverage sections={sections} current={index} />
  </Frame>;
}

function Alignment({sections, plan}) {
  const f = useCurrentFrame();
  const chain = ['questions', 'data', 'analysis'].map(id => sections.find(s => s.id === id));
  const colors = [C.cyan, C.violet, C.amber];
  return <Frame duration={ALIGN}>
    <Header label="QUESTION → DATA → ANALYSIS" plan={plan} />
    <div style={{position: 'absolute', top: 110, left: 0, right: 0, textAlign: 'center', fontSize: 56, fontWeight: 900, letterSpacing: -1.5}}>질문 → 자료 → 분석이 이어지는가</div>
    <div style={{position: 'absolute', top: 260, left: 90, right: 90, display: 'flex', alignItems: 'stretch', gap: 26}}>
      {chain.map((s, i) => {
        const k = pop(f, 10 + i * 18);
        const ok = confirmed(s);
        return <React.Fragment key={i}>
          <div style={{flex: 1, opacity: k, transform: `translateY(${(1 - k) * 30}px)`, padding: '28px 30px', borderRadius: 22, background: C.panel, border: `1.5px solid ${ok ? colors[i] : C.red}`, boxShadow: `0 0 40px ${ok ? colors[i] : C.red}22`}}>
            <div style={{fontSize: 36, fontWeight: 900, color: ok ? colors[i] : C.red}}>{s?.title || ['연구문제', '자료', '분석'][i]}</div>
            <div style={{marginTop: 18, fontSize: 27, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: ok ? C.ink : C.red}}>{ok ? excerpt(s.text, 170) : '미확인 — 이 연결이 끊겨 있습니다'}</div>
          </div>
          {i < 2 && <div style={{alignSelf: 'center', fontSize: 54, color: C.dim, opacity: fade(f, 30 + i * 18, 45 + i * 18)}}>→</div>}
        </React.Fragment>;
      })}
    </div>
    <div style={{position: 'absolute', top: 860, left: 0, right: 0, textAlign: 'center', fontSize: 30, color: C.muted, opacity: fade(f, 70, 90)}}>질문에 필요한 자료가 있는지, 분석이 질문에 답할 수 있는지는 <span style={{color: C.ink, fontWeight: 700}}>연구자가 판단합니다</span></div>
  </Frame>;
}

function Gaps({sections, changes, plan}) {
  const f = useCurrentFrame();
  const missing = sections.filter(s => !confirmed(s));
  const changed = changes.filter(c => c.changed);
  return <Frame duration={GAPS}>
    <Header label="NEXT DECISION" plan={plan} />
    <div style={{position: 'absolute', top: 200, left: 0, right: 0, textAlign: 'center'}}>
      <div style={{fontSize: 60, fontWeight: 900, letterSpacing: -1.5}}>{missing.length ? <>보강이 필요한 설계 요소 <span style={{color: C.amber}}>{missing.length}개</span></> : <>설계 요소가 <span style={{color: C.green}}>모두 확인</span>되었습니다</>}</div>
      <div style={{marginTop: 40, display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', padding: '0 160px'}}>
        {(missing.length ? missing : sections).map((s, i) => <span key={s.id} style={{opacity: fade(f, 12 + i * 4, 24 + i * 4)}}><Chip color={missing.length ? C.amber : C.green}>{s.title}</Chip></span>)}
      </div>
      {changed.length > 0 && <div style={{marginTop: 36, fontSize: 30, color: C.violet}}>이전 계획서 대비 변경된 절 {changed.length}개</div>}
      <div style={{marginTop: 60, fontSize: 30, color: C.muted, lineHeight: 1.7}}>이 영상은 계획서에서 파생된 설계도입니다. 문헌 근거의 확인 여부는 근거 장부에 따로 기록됩니다.<br />보완·수집·최종 채택은 연구자의 결정입니다.</div>
    </div>
  </Frame>;
}

export const blueprintFrames = ({sections = []}) => TITLE + sections.length * SECTION + ALIGN + GAPS;

function Film({title = '연구 설계', plan, sections = [], changes = [], audio_asset}) {
  let at = 0;
  const place = length => { const from = at; at += length; return from; };
  return <AbsoluteFill style={{background: C.bg}}>
    <Backdrop />
    {audio_asset && <Audio src={staticFile(audio_asset)} />}
    <Sequence from={place(TITLE)} durationInFrames={TITLE}><Title title={title} plan={plan} sections={sections} /></Sequence>
    {sections.map((section, i) => <Sequence key={section.id} from={place(SECTION)} durationInFrames={SECTION}>
      <SectionScene section={section} index={i} sections={sections} plan={plan} change={changes.find(c => c.id === section.id && c.changed)} />
    </Sequence>)}
    <Sequence from={place(ALIGN)} durationInFrames={ALIGN}><Alignment sections={sections} plan={plan} /></Sequence>
    <Sequence from={place(GAPS)} durationInFrames={GAPS}><Gaps sections={sections} changes={changes} plan={plan} /></Sequence>
  </AbsoluteFill>;
}

registerRoot(() => <Composition id="Blueprint" component={Film} width={1920} height={1080} fps={FPS} durationInFrames={blueprintFrames({sections: new Array(9).fill(0)})} defaultProps={{sections: [], changes: []}} calculateMetadata={({props}) => ({durationInFrames: blueprintFrames(props)})} />);
