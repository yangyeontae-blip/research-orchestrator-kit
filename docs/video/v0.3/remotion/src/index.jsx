import React from 'react';
import {registerRoot, Composition, AbsoluteFill, Audio, staticFile, useCurrentFrame, interpolate, spring} from 'remotion';

const C={ink:'#F8FAFF',muted:'#9DACCC',cyan:'#4CE6DC',violet:'#9A7CFF',gold:'#FFC857',coral:'#FF7A90',bg:'#050817',panel:'#0E1733'};
const scenes=[
 ['연구의 흐름이 끊기는 순간','아이디어 · 문헌 · 계획서가 서로 다른 버전을 가리킬 때','problem'],
 ['출발점을 명시합니다','아이디어에서 APA 7 · JQI · 범용 계획서까지','start'],
 ['다섯 역할, 하나의 상태','기획 · 공부 · 연구 · 문헌 · 영상','agents'],
 ['문헌을 읽되, 상태를 남깁니다','PDF · HWP · HWPX  /  원문 · 파싱 · 메타데이터','evidence'],
 ['승인은 정확한 해시에 묶입니다','수집 · 반영 · 영상','gates'],
 ['Markdown은 원본입니다','DOCX · HWPX는 같은 원본에서 다시 만듭니다','output'],
 ['마지막 판단은 연구자에게','검증 가능한 흐름, 과장하지 않는 기록','end']
];
const fps=30, frames=300;
const enter=f=>spring({frame:f,fps,config:{damping:16,mass:.7}});
const Chip=({children,color=C.cyan,delay=0})=>{const f=useCurrentFrame()%frames;const s=enter(Math.max(0,f-delay));return <div style={{opacity:interpolate(s,[0,1],[0,1]),transform:`translateY(${interpolate(s,[0,1],[38,0])}px) scale(${interpolate(s,[0,1],[.9,1])})`,border:`1px solid ${color}AA`,boxShadow:`0 0 32px ${color}33`,borderRadius:18,padding:'18px 24px',fontSize:28,fontWeight:800,background:'#101a38CC'}}>{children}</div>};
function Visual({kind}){const f=useCurrentFrame()%frames;const common={height:380,display:'flex',alignItems:'center',justifyContent:'center',gap:22,position:'relative'};
 if(kind==='problem')return <div style={common}>{['아이디어','문헌','계획서'].map((x,i)=><React.Fragment key={x}><Chip delay={i*13} color={[C.gold,C.violet,C.cyan][i]}>{x}<div style={{fontSize:17,color:C.muted,marginTop:7}}>서로 다른 버전</div></Chip>{i<2&&<span style={{color:C.coral,fontSize:50,opacity:.55}}>×</span>}</React.Fragment>)}</div>;
 if(kind==='start')return <div style={{...common,flexDirection:'column'}}><div style={{fontFamily:'monospace',fontSize:42,color:C.cyan}}>$ rok new</div><div style={{display:'flex',gap:20}}>{['APA 7','JQI','generic'].map((x,i)=><Chip key={x} delay={i*16} color={[C.cyan,C.violet,C.gold][i]}>{x}</Chip>)}</div></div>;
 if(kind==='agents')return <div style={common}>{['기획','공부','연구','문헌','영상'].map((x,i)=><React.Fragment key={x}><Chip delay={i*8} color={i===0?C.gold:C.cyan}>{x}</Chip>{i<4&&<span style={{color:C.violet,fontSize:35}}>→</span>}</React.Fragment>)}</div>;
 if(kind==='evidence')return <div style={{...common,flexDirection:'column'}}><div style={{display:'flex',gap:18}}>{['PDF','HWP','HWPX'].map((x,i)=><Chip key={x} delay={i*10} color={[C.gold,C.cyan,C.violet][i]}>{x}</Chip>)}</div><div style={{display:'flex',gap:16}}>{['원문 확인','파싱 확인','메타데이터','미확인'].map((x,i)=><Chip key={x} delay={40+i*8} color={[C.cyan,C.violet,C.gold,'#FF7A90'][i]}>{x}</Chip>)}</div></div>;
 if(kind==='gates')return <div style={common}>{['수집','반영','영상'].map((x,i)=><Chip key={x} delay={i*16} color={C.gold}><div style={{fontSize:42,textAlign:'center'}}>⌁</div>{x} 승인<div style={{fontFamily:'monospace',fontSize:15,color:C.muted,marginTop:5}}>SHA-256</div></Chip>)}</div>;
 if(kind==='output')return <div style={common}><Chip color={C.cyan}>Markdown</Chip><span style={{color:C.violet,fontSize:54}}>→</span><div style={{display:'flex',flexDirection:'column',gap:14}}><Chip delay={18} color={C.gold}>DOCX</Chip><Chip delay={32} color={C.violet}>HWPX</Chip></div></div>;
 return <div style={{...common,flexDirection:'column'}}><div style={{fontSize:110,color:C.cyan}}>◉</div><div style={{fontSize:36,fontWeight:900}}>연구자의 판단</div><div style={{fontSize:25,color:C.muted}}>자동화는 근거와 과정을 투명하게 남깁니다</div></div>;
}
function Scene({data,index}){const f=useCurrentFrame()%frames;const opacity=interpolate(f,[0,16,frames-18,frames],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});const pulse=0.5+Math.sin(f/22)*.5;return <AbsoluteFill style={{opacity,fontFamily:'Malgun Gothic, Arial, sans-serif',color:C.ink,padding:'76px 118px',background:`radial-gradient(circle at ${70+pulse*10}% ${18+pulse*8}%,#243D8A66,transparent 31%),linear-gradient(135deg,#050817,#08162F 58%,#160C31)`}}><div style={{position:'absolute',inset:0,opacity:.16,backgroundImage:'linear-gradient(#4CE6DC22 1px,transparent 1px),linear-gradient(90deg,#4CE6DC22 1px,transparent 1px)',backgroundSize:'70px 70px'}}/><div style={{position:'relative',display:'flex',gap:18,alignItems:'center'}}><b style={{color:C.cyan,fontFamily:'monospace',fontSize:24}}>ROK / {String(index+1).padStart(2,'0')}</b><div style={{height:2,flex:1,background:'linear-gradient(90deg,#4CE6DC,transparent)'}}/></div><div style={{position:'relative'}}><h1 style={{fontSize:68,lineHeight:1.12,letterSpacing:-3,margin:'42px 0 16px'}}>{data[0]}</h1><p style={{fontSize:30,color:C.muted,margin:0}}>{data[1]}</p><Visual kind={data[2]}/></div><div style={{position:'absolute',bottom:42,left:118,right:118,display:'flex',justifyContent:'space-between',color:C.muted,fontSize:19}}><span>research-orchestrator-kit v0.3</span><span>{String(index+1).padStart(2,'0')} / 07</span></div></AbsoluteFill>}
function Video(){const f=useCurrentFrame();const i=Math.min(6,Math.floor(f/frames));return <AbsoluteFill><Audio src={staticFile('narration.mp3')} /><Audio src={staticFile('ambient.mp3')} volume={.085} loop/><Scene data={scenes[i]} index={i}/></AbsoluteFill>}
function Root(){return <Composition id="RokIntroV3" component={Video} durationInFrames={2100} fps={fps} width={1920} height={1080}/>}
registerRoot(Root);

