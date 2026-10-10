import React from 'react';
import {registerRoot, Composition, AbsoluteFill, Audio, staticFile, useCurrentFrame, interpolate, spring} from 'remotion';

const C={bg:'#07111F',panel:'#102239',ink:'#F4F8FF',muted:'#9FB3C8',cyan:'#43D9D0',blue:'#5C8DFF',gold:'#FFC857',coral:'#FF7A90'};
const scenes=[
 {k:'01',title:'연구의 연결이 끊기는 순간',sub:'대화 · 메모 · PDF · 계획서가 서로 다른 버전을 가리킬 때',type:'scatter'},
 {k:'02',title:'출발점을 명시합니다',sub:'아이디어 · 형식 · 방법 · 마감 · 민감정보',type:'profiles'},
 {k:'03',title:'다섯 에이전트, 하나의 상태',sub:'파일과 SHA-256이 인계의 공통 언어가 됩니다',type:'agents'},
 {k:'04',title:'주장마다 근거 상태를 남깁니다',sub:'검색 → 중복 제거 → 로컬 PDF 파싱 → 근거 장부',type:'evidence'},
 {k:'05',title:'세 관문이 버전을 지킵니다',sub:'수집 승인 · 반영 승인 · 영상 승인',type:'gates'},
 {k:'06',title:'실패한 지점부터 다시',sub:'성공 산출물 보존 · Markdown 원본 · DOCX와 영상',type:'resume'},
 {k:'07',title:'연구자의 판단이 마지막입니다',sub:'로컬 우선 · 투명한 상태 · 재현 가능한 검증',type:'finish'}
];
const fps=30,sceneFrames=450;
const fade=f=>interpolate(f,[0,18,sceneFrames-18,sceneFrames],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
const Pill=({children,color=C.cyan})=><div style={{padding:'12px 22px',border:`2px solid ${color}`,borderRadius:999,color,fontSize:28,fontWeight:700,background:'#081828DD'}}>{children}</div>;
const Card=({children,delay=0,accent=C.blue})=>{const frame=useCurrentFrame()%sceneFrames;const y=interpolate(spring({frame:Math.max(0,frame-delay),fps,config:{damping:16}}),[0,1],[70,0]);return <div style={{transform:`translateY(${y}px)`,opacity:interpolate(frame,[delay,delay+18],[0,1],{extrapolateRight:'clamp'}),background:C.panel,border:`1px solid ${accent}88`,borderRadius:22,padding:'24px 30px',boxShadow:'0 20px 50px #0007'}}>{children}</div>};
function Graphic({type}){const common={display:'flex',alignItems:'center',justifyContent:'center',gap:24,width:'100%',height:380};
 if(type==='scatter')return <div style={common}>{['대화 #a31','PDF #9c2','계획서 #f07'].map((x,i)=><Card key={x} delay={i*8} accent={[C.coral,C.gold,C.blue][i]}><b style={{fontSize:34}}>{x}</b><div style={{color:C.muted,fontSize:22,marginTop:12}}>서로 다른 버전</div></Card>)}</div>;
 if(type==='profiles')return <div style={{...common,flexDirection:'column'}}><Pill color={C.cyan}>$ rok new</Pill><div style={{display:'flex',gap:24}}>{['APA 7','JQI','generic'].map((x,i)=><Card key={x} delay={i*7}><b style={{fontSize:38}}>{x}</b></Card>)}</div></div>;
 if(type==='agents')return <div style={{...common,gap:12}}>{['기획팀장','공부','연구','문헌','영상'].map((x,i)=><React.Fragment key={x}><Card delay={i*5} accent={i===0?C.gold:C.cyan}><b style={{fontSize:27}}>{x}</b></Card>{i<4&&<span style={{fontSize:38,color:C.blue}}>→</span>}</React.Fragment>)}</div>;
 if(type==='evidence')return <div style={{...common,flexDirection:'column'}}><div style={{display:'flex',gap:14}}>{['Crossref + OpenAlex','DOI/제목 중복 제거','로컬 PDF.js'].map((x,i)=><Pill key={x} color={[C.blue,C.cyan,C.gold][i]}>{x}</Pill>)}</div><div style={{display:'flex',gap:18}}>{['원문 확인','파싱 확인','메타데이터','미확인'].map((x,i)=><Card key={x} delay={i*6} accent={[C.cyan,C.blue,C.gold,C.coral][i]}><b style={{fontSize:25}}>{x}</b></Card>)}</div></div>;
 if(type==='gates')return <div style={common}>{['수집','반영','영상'].map((x,i)=><Card key={x} delay={i*9} accent={C.gold}><div style={{fontSize:54,textAlign:'center'}}>🔒</div><b style={{fontSize:34}}>{x} 승인</b><div style={{fontFamily:'monospace',color:C.muted,fontSize:18,marginTop:12}}>SHA-256</div></Card>)}</div>;
 if(type==='resume')return <div style={common}><Card accent={C.coral}><b style={{fontSize:32}}>부분 실패</b><div style={{color:C.muted,fontSize:23,marginTop:12}}>성공 산출물 보존</div></Card><span style={{fontSize:50,color:C.cyan}}>↻</span><Card delay={10} accent={C.cyan}><b style={{fontSize:32}}>실패 지점 재개</b><div style={{color:C.muted,fontSize:23,marginTop:12}}>Markdown → DOCX · MP4</div></Card></div>;
 return <div style={{...common,flexDirection:'column'}}><div style={{fontSize:90,color:C.cyan}}>✓</div><Pill color={C.cyan}>npm run verify</Pill><div style={{fontSize:29,color:C.muted}}>9.5점은 외부 평가 완료 전까지 목표입니다</div></div>;
}
function Scene({scene,local}){return <AbsoluteFill style={{opacity:fade(local),fontFamily:'Malgun Gothic, Noto Sans KR, Arial, sans-serif',color:C.ink,padding:'82px 120px'}}><div style={{display:'flex',alignItems:'center',gap:22}}><div style={{fontFamily:'monospace',fontSize:27,color:C.cyan}}>ROK / {scene.k}</div><div style={{height:2,flex:1,background:`linear-gradient(90deg,${C.cyan},transparent)`}}/></div><h1 style={{fontSize:66,lineHeight:1.18,letterSpacing:-2,margin:'42px 0 12px'}}>{scene.title}</h1><p style={{fontSize:31,color:C.muted,margin:0}}>{scene.sub}</p><Graphic type={scene.type}/><div style={{position:'absolute',bottom:42,left:120,right:120,display:'flex',justifyContent:'space-between',fontSize:20,color:C.muted}}><span>research-orchestrator-kit v0.2</span><span>{scene.k} / 07</span></div></AbsoluteFill>}
function RokIntro(){const frame=useCurrentFrame();const idx=Math.min(scenes.length-1,Math.floor(frame/sceneFrames));return <AbsoluteFill style={{background:`radial-gradient(circle at 80% 15%,#143A59 0,${C.bg} 48%)`}}><Audio src={staticFile('silence.wav')} loop volume={0}/><Scene scene={scenes[idx]} local={frame%sceneFrames}/></AbsoluteFill>}
function Root(){return <Composition id="RokIntro" component={RokIntro} durationInFrames={scenes.length*sceneFrames} fps={fps} width={1920} height={1080}/>}
registerRoot(Root);
