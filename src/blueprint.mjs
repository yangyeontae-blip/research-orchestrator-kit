import * as fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {Engine} from './engine.mjs';
import {readJson,writeJson,packageRoot} from './utils.mjs';
import {execute} from './process.mjs';
// Heading patterns cover Korean and English plan conventions; a section is only "confirmed" when a heading matches.
const SECTIONS=[['problem','문제의식',/문제의식|문제\s*제기|문제와|필요성|서론|배경|problem|introduction|background|rationale|significance/i],['purpose','연구 목적',/목적|목표|purpose|aims?\b|objective/i],['questions','연구문제',/연구\s*문제|연구\s*질문|questions?/i],['concepts','개념',/개념|이론|분석\s*틀|concept|theor|framework/i],['data','자료',/자료|대상|참여자|표본|data|participant|sample|material/i],['analysis','분석',/분석|연구\s*방법|방법론|analysis|method/i],['ethics','윤리',/윤리|동의|IRB|ethic|consent/i],['contribution','예상 기여',/기대|기여|의의|contribution|expected|outcome|implication/i],['limitations','한계',/한계|범위|limitation|scope|boundar|delimit/i]];
// Splits a plan into the nine blueprint elements by heading; an element without a matching heading stays unconfirmed.
export function planSections(text,plan=null){
 const lines=String(text).split(/\r?\n/);
 const headings=lines.flatMap((line,i)=>/^#{1,6}\s/.test(line)?[{text:line,line:i,level:line.match(/^#+/)[0].length}]:[]);
 return SECTIONS.map(([id,title,pattern])=>{
  const index=headings.findIndex(h=>pattern.test(h.text));if(index<0)return {id,title,status:'unconfirmed',text:'계획서에서 해당 절을 확인하지 못했습니다.',source:null};
  // A section runs to the next heading of the same or a higher level, so its subheadings stay inside it.
  const start=headings[index].line,end=headings.slice(index+1).find(h=>h.level<=headings[index].level)?.line??lines.length;
  return {id,title,status:'plan_excerpt_not_evidence_verification',text:lines.slice(start+1,end).join('\n').trim(),source:plan?{path:plan.path,sha256:plan.sha256,start_line:start+2,end_line:end}:{start_line:start+2,end_line:end}};
 });
}
export async function createBlueprint(root,planPath,{previous}={}){
 const engine=new Engine(root),plan=await engine.artifact(planPath,'plan');const text=await fs.readFile(path.join(root,plan.path),'utf8');
 const headings=text.split(/\r?\n/).flatMap((line,i)=>/^#{1,6}\s/.test(line)?[{text:line,line:i}]:[]);
 const sections=planSections(text,plan);
 const before=previous?await readJson(path.join(root,(await engine.artifact(previous)).path)):null;
 const changes=before?sections.map(s=>({id:s.id,changed:before.sections.find(b=>b.id===s.id)?.text!==s.text,before:before.sections.find(b=>b.id===s.id)?.text||'',after:s.text,reason:'Text difference only; researcher/reviewer explanation pending'})):[];
 const dir=path.join('.research-work','blueprints',plan.sha256,randomUUID());await fs.mkdir(path.join(root,dir),{recursive:true});
 const blueprint={schema_version:1,plan,created_at:new Date().toISOString(),title:headings[0]?.text.replace(/^#+\s*/, '')||'연구 설계',sections,changes,previous_plan:before?.plan||null,audio:false};
 const file=path.join(dir,'research-blueprint.json');await writeJson(path.join(root,file),blueprint);
 return {blueprint:await engine.artifact(file,'research_blueprint'),missing:sections.filter(s=>!s.source).map(s=>s.id),status:'generated_not_reviewed'};
}
export async function renderBlueprint(root,binding,{confirmation,audio,rendererDirectory=path.join(packageRoot,'docs/video/v0.5/remotion'),worker=execute}={}){
 if(!confirmation?.text?.trim()||!confirmation?.source?.trim()||confirmation.blueprint_sha256!==binding.sha256)throw new Error('Approve exact blueprint hash and record actual user response/source before rendering');
 const engine=new Engine(root),bpFile=await engine.artifact(binding);const bp=await readJson(path.join(root,bpFile.path));await engine.artifact(bp.plan);
 const outDir=path.join(path.dirname(bpFile.path),'render-'+randomUUID());await fs.mkdir(path.join(root,outDir));
 const output=path.join(outDir,'blueprint.mp4');
 const cli=path.join(rendererDirectory,'node_modules/@remotion/cli/remotion-cli.js');
 await fs.access(cli).catch(()=>{throw new Error('Optional Remotion renderer not installed. Install dependencies in docs/video/v0.5/remotion; see license notice.');});
 const assets=path.join(root,outDir,'assets');await fs.mkdir(assets);
 let voice=null;if(audio){voice=await engine.artifact(audio,'voice');if(confirmation.audio_sha256!==voice.sha256)throw new Error('Voice use requires exact audio hash consent');if(!/\.(mp3|wav|m4a)$/i.test(voice.path))throw new Error('Supported voice formats: mp3/wav/m4a');bp.audio_asset='voice'+path.extname(voice.path);await fs.copyFile(path.join(root,voice.path),path.join(assets,bp.audio_asset));}
 const props=path.join(root,outDir,'props.json');await writeJson(props,bp);
 const entry=path.join(rendererDirectory,'.rok-renderer/blueprint.jsx');await fs.mkdir(path.dirname(entry),{recursive:true});await fs.copyFile(path.join(packageRoot,'src/renderer/blueprint.jsx'),entry);
 await worker(process.execPath,[cli,'render',entry,'Blueprint',path.join(root,output),'--props',props,'--public-dir',assets,'--codec','h264','--pixel-format','yuv420p','--concurrency','2'],{cwd:rendererDirectory,timeout:1200000});
 await worker('ffmpeg',['-v','error','-i',path.join(root,output),'-f','null','-'],{cwd:root,timeout:180000});
 const video=await engine.artifact(output,'video_file');const manifest={plan:bp.plan,blueprint:bpFile,video,confirmation,audio:Boolean(voice),voice,decode_checked:true,visual_checked:false,playback_checked:false,caption_sources:bp.sections.map(s=>s.source),created_at:new Date().toISOString()};
 await writeJson(path.join(root,outDir,'video-manifest.json'),manifest);return manifest;
}
export async function previewVideo(root,file){
 const engine=new Engine(root),binding=await engine.artifact(file);if(!/\.mp4$/i.test(binding.path))throw new Error('MP4 required');const absolute=path.join(root,binding.path),size=(await fs.stat(absolute)).size;
 const server=createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>ROK 연구 블루프린트</title><style>body{background:#081121;color:white;font:20px sans-serif;margin:4vw}video{width:100%;max-height:80vh}</style><h1>연구 블루프린트 · 계획 단계</h1><video controls preload="metadata" src="/video"></video><p><a href="/download">MP4 다운로드</a></p>');return;}
  if(!['/video','/download'].includes(req.url)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type','video/mp4');res.setHeader('Accept-Ranges','bytes');if(req.url==='/download')res.setHeader('Content-Disposition','attachment; filename="blueprint.mp4"');
  const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);let start=0,end=size-1;
  if(req.headers.range&&!range){res.writeHead(416).end();return;}if(range){start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),size-1):size-1;if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);}
  res.setHeader('Content-Length',end-start+1);if(req.method==='HEAD'){res.end();return;}createReadStream(absolute,{start,end}).on('error',()=>res.destroy()).pipe(res);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return {server,url:`http://127.0.0.1:${server.address().port}`};
}
