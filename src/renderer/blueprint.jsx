import React from 'react';
import {AbsoluteFill,Audio,staticFile,Composition,Sequence,registerRoot,useCurrentFrame,interpolate} from 'remotion';
const theme={background:'#081121',color:'#edf5ff',fontFamily:'"Malgun Gothic", "Noto Sans CJK KR", sans-serif'};
function Scene({section,index,changes,sections}){
 const frame=useCurrentFrame();const progress=interpolate(frame,[0,20],[0,1],{extrapolateRight:'clamp'});const change=changes.find(x=>x.id===section.id&&x.changed);
 return <AbsoluteFill style={{...theme,padding:100,background:'radial-gradient(ellipse at top right, #163957, #081121 70%)'}}>
 <div style={{fontSize:25,color:'#68e5d6'}}>ROK · RESEARCH BLUEPRINT · 연구 계획 / 결과 아님</div>
 <div style={{opacity:progress,transform:`translateY(${(1-progress)*24}px)`}}><h1 style={{fontSize:65,marginBottom:35}}>{String(index+1).padStart(2,'0')} / {section.title}</h1>
 <div style={{borderLeft:'7px solid #68e5d6',padding:'20px 35px',fontSize:36,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{section.text.length>180?section.text.slice(0,180)+'… [일부 발췌]':section.text}</div></div>
 <div style={{position:'absolute',top:610,left:100,right:100,display:'flex',gap:24}}>{['questions','data','analysis'].map((id,i)=>{const node=sections.find(s=>s.id===id);return <div key={id} style={{flex:1,padding:25,border:'1px solid #2e546b',borderRadius:16,background:'#10253b',fontSize:25,lineHeight:1.6}}><strong style={{color:'#68e5d6'}}>{i+1}. {node?.title}</strong><div>{(node?.text||'미확인').slice(0,95)}</div></div>})}</div>
 {change&&<div style={{position:'absolute',top:490,left:100,color:'#f4c77d',fontSize:23}}>이전: {change.before.slice(0,110)||'해당 절 없음'} → 현재 계획서의 변경 절</div>}
 <div style={{position:'absolute',bottom:100,fontSize:25,color:'#adc0d2'}}>{change?'보완본 변경 절 · 변경 이유는 검토 보고서 확인':section.source?`계획서 ${section.source.start_line}–${section.source.end_line}행 · 근거 검증과 별개`:'미확인 · 설계 보강 필요'}</div>
 <div style={{position:'absolute',bottom:50,left:100,right:100,height:4,background:'#233a50'}}><div style={{width:`${Math.min(frame/240*100,100)}%`,height:4,background:'#68e5d6'}}/></div>
 </AbsoluteFill>;
}
function Film({sections=[],changes=[],audio_asset}){return <AbsoluteFill>{audio_asset&&<Audio src={staticFile(audio_asset)}/>}{sections.map((section,i)=><Sequence key={section.id} from={i*240} durationInFrames={240}><Scene section={section} index={i} changes={changes} sections={sections}/></Sequence>)}</AbsoluteFill>}
registerRoot(()=> <Composition id="Blueprint" component={Film} width={1920} height={1080} fps={30} durationInFrames={2160} defaultProps={{sections:[],changes:[]}}/>);
