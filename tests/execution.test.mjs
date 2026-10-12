import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {toolkitFixture} from './helpers.mjs';
import {Engine} from '../src/engine.mjs';
import {authorizeRun,runWorkflow} from '../src/execution.mjs';
import {createBlueprint,renderBlueprint,previewVideo} from '../src/blueprint.mjs';
import {verifyEvidence} from '../src/evidence.mjs';
import {publicIPv4} from '../src/acquisition.mjs';
import {searchLiterature} from '../src/literature.mjs';
const confirmation={text:'Approve synthetic run only',source:'synthetic-test'};
async function setup(t){const root=await toolkitFixture(t);await fs.writeFile(path.join(root,'input.md'),'Synthetic nonpersonal idea');const engine=new Engine(root);const status=await engine.init({profile:'generic'});const task=await engine.enqueue({schema_version:1,request_id:'example',stage:'study',inputs:[{path:'input.md'}]});await authorizeRun(root,{workflow_id:status.workflow_id,provider:'claude_cli',inputs:[{path:'input.md'}],queries:[]},confirmation);return {root,engine,task};}
test('runner invokes worker and preserves completed work on resume',async t=>{
 const {root,engine}=await setup(t);let calls=0;const worker=async()=>{calls++;return JSON.stringify({structured_output:{status:'completed',handoff_state:'hold',reason:'Synthetic study only',files:[{name:'study.md',kind:'study_record',content:'Synthetic study; no human learning claimed.'}]}});};
 await runWorkflow(root,{worker});assert.equal((await engine.status()).tasks[0].status,'completed');await runWorkflow(root,{worker,resume:true});assert.equal(calls,1);
});
test('changed approved input and active lock block execution',async t=>{
 const {root}=await setup(t);await fs.writeFile(path.join(root,'input.md'),'changed');await assert.rejects(runWorkflow(root,{worker:()=>assert.fail()}),/hash mismatch/);
 await fs.writeFile(path.join(root,'.research-work/runner.lock'),'{}');await assert.rejects(runWorkflow(root),/already active/);
});
test('worker failure resumes only failed stage',async t=>{
 const {root,engine}=await setup(t);await assert.rejects(runWorkflow(root,{worker:async()=>{throw new Error('quota');}}),/quota/);assert.equal((await engine.status()).tasks[0].status,'partial');
 await runWorkflow(root,{resume:true,worker:async()=>JSON.stringify({structured_output:{status:'completed',handoff_state:'hold',reason:'done',files:[{name:'study.md',kind:'study_record',content:'Synthetic record'}]}})});assert.equal((await engine.status()).tasks[0].status,'completed');
});
test('worker traversal cannot become completed artifacts',async t=>{
 const {root,engine}=await setup(t);await assert.rejects(runWorkflow(root,{worker:async()=>JSON.stringify({structured_output:{status:'completed',handoff_state:'hold',reason:'x',files:[{name:'../outside.md',kind:'study_record',content:'x'}]}})}),/Unsafe/);assert.equal((await engine.status()).tasks[0].status,'partial');
});
test('blueprint source lines and render approval track plan changes',async t=>{
 const root=await toolkitFixture(t);await fs.writeFile(path.join(root,'plan.md'),'# Synthetic\n\n## 연구문제\nHow?\n\n## 자료\nSynthetic diaries\n');const first=await createBlueprint(root,'plan.md');const bp=JSON.parse(await fs.readFile(path.join(root,first.blueprint.path)));assert.equal(bp.sections.find(s=>s.id==='questions').source.start_line,4);assert.ok(first.missing.includes('analysis'));
 await fs.appendFile(path.join(root,'plan.md'),'\n## 분석\nCompare\n');await assert.rejects(renderBlueprint(root,first.blueprint,{confirmation:{...confirmation,blueprint_sha256:first.blueprint.sha256}}),/hash mismatch/);const second=await createBlueprint(root,'plan.md',{previous:first.blueprint.path});assert.ok(JSON.parse(await fs.readFile(path.join(root,second.blueprint.path))).changes.some(c=>c.id==='analysis'&&c.changed));
});
test('evidence checks quotes without claiming human verification',async t=>{
 const root=await toolkitFixture(t),engine=new Engine(root);await fs.writeFile(path.join(root,'plan.md'),'This is an exact synthetic claim.');await fs.writeFile(path.join(root,'source.txt'),'source');const source=await engine.artifact('source.txt');await fs.writeFile(path.join(root,'pages.json'),JSON.stringify({sha256:source.sha256,pages:[{pdf_page:1,printed_page:null,text:'supporting passage'}]}));const plan=await engine.artifact('plan.md');const result=await verifyEvidence(root,plan,{plan_sha256:plan.sha256,claims:[{id:'c1',claim:'This is an exact synthetic claim.',locations:[{document:source,parsed:await engine.artifact('pages.json'),pdf_page:1,quote:'fabricated passage',relation:'support'}]}]});assert.equal(result.findings[0].location_check,'failed');assert.equal(result.human_verified,false);
});
test('preview serves inline video and byte ranges',async t=>{
 const root=await toolkitFixture(t);await fs.writeFile(path.join(root,'test.mp4'),'0123456789');const {server,url}=await previewVideo(root,'test.mp4');t.after(()=>server.close());const res=await fetch(url+'/video',{headers:{Range:'bytes=2-5'}});assert.equal(res.status,206);assert.equal(await res.text(),'2345');assert.equal(res.headers.get('content-type'),'video/mp4');assert.equal((await fetch(url+'/video')).headers.get('content-disposition'),null);
});
test('download blocks local and reserved address ranges',()=>{for(const ip of ['127.0.0.1','10.1.1.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0'])assert.equal(publicIPv4(ip),false);assert.equal(publicIPv4('8.8.8.8'),true);});
test('provider failure preserves metadata and OA provenance',async t=>{
 const root=await toolkitFixture(t);const result=await searchLiterature(root,'workspace/test','synthetic',{fetchImpl:async url=>{if(url.includes('crossref'))throw new Error('offline');return {ok:true,json:async()=>({results:[{display_name:'Synthetic paper',publication_year:2030,locations:[{is_oa:true,pdf_url:'https://example.org/paper.pdf',license:'cc-by',version:'publishedVersion'}]}]})};}});assert.equal(result.total,1);assert.equal(result.items[0].oa_locations[0].license,'cc-by');const manifest=JSON.parse(await fs.readFile(path.join(root,result.manifest_path)));assert.equal(manifest.searches[0].failures.length,1);
});

import {createResearchProject} from '../src/wizard.mjs';

for(const [profile,method]of [['apa7','qualitative autoethnography'],['jqi','qualitative interview'],['generic','quantitative survey']])test(`synthetic ${profile} creates plan, DOCX, quality report and blueprint without JSON editing by researcher`,async t=>{
 const root=await toolkitFixture(t);await createResearchProject(root,{title:'Synthetic '+profile,idea:'Synthetic research only',profile,entry_mode:'direct_plan',method,deadline:null,institution_guidance:'Synthetic example',sensitive_information:false});
 const engine=new Engine(root),state=await engine.status();await authorizeRun(root,{workflow_id:state.workflow_id,provider:'claude_cli',inputs:state.tasks[0].inputs,queries:[]},confirmation);
 const content='# Synthetic plan\n\n## 연구문제\nWhat changes?\n\n## 자료\nSynthetic data only\n\n## 분석\nCompare patterns\n\n## 윤리\nNo real participants\n\n## 한계\nNot an actual study';
 await runWorkflow(root,{worker:async()=>JSON.stringify({structured_output:{status:'completed',handoff_state:'none',reason:'Synthetic generation, not verification',files:[{name:'plan.md',kind:'plan',content},{name:'quality.md',kind:'quality_review',content:'Human review pending'},{name:'handoff.md',kind:'literature_handoff',content:'Evidence remains unverified'}]}})});
 const after=await engine.status();assert.equal(after.current_stage,'plan_use_verification');const scope=JSON.parse(await fs.readFile(path.join(root,'.research-work/run-scope.json')));assert.ok(scope.last_blueprint);await fs.access(path.join(root,state.project_dir,'document-manifest.json'));await fs.access(path.join(root,state.project_dir,'quality-report.json'));
});

import {execute} from '../src/process.mjs';
test('native subprocess executes structured output without shell and stops on cancellation',async()=>{
 assert.equal((await execute(process.execPath,['-e','process.stdout.write(JSON.stringify({ok:true}))'])).trim(),'{"ok":true}');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),100);await assert.rejects(execute(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal}),/stopped/);clearTimeout(timer);
});

import {parseKci,searchKci} from '../src/kci.mjs';
import {parseBibliography} from '../src/bibliography.mjs';
import {collectOpenAccess} from '../src/acquisition.mjs';
import {makePdf} from './helpers.mjs';
test('KCI official fields preserve metadata and reject unexpected/entity responses',async()=>{
 const xml='<result><record><journalInfo><journal-name>Synthetic Journal</journal-name><pub-year>2030</pub-year></journalInfo><articleInfo><article-title lang="original">Synthetic title</article-title><author>Author A</author><doi>10.0000/synthetic</doi></articleInfo></record></result>';
 const rows=parseKci(xml);assert.equal(rows[0].title,'Synthetic title');assert.equal(rows[0].year,2030);assert.throws(()=>parseKci('<!DOCTYPE x><result/>'),/Unsupported/);await assert.rejects(searchKci('test',{key:''}),/unavailable/);
 let checked=false;await searchKci('title',{key:'synthetic',fetchImpl:async url=>{checked=new URL(url).searchParams.get('apiCode')==='articleSearch';return {ok:true,text:async()=>xml};}});assert.ok(checked);
});
test('RIS and nested BibTeX imports remain metadata only and reject unsupported macros',()=>{
 const ris=parseBibliography('TY  - JOUR\nTI  - Synthetic title\nAU  - Author A\nPY  - 2030\nER  -\n','ris');assert.equal(ris[0].verification,'metadata_only');assert.equal(ris[0].authors[0],'Author A');
 const bib=parseBibliography('@article{test,title={A {nested} title},author={Alpha and Beta},year={2030}}','bib');assert.equal(bib[0].year,2030);assert.equal(bib[0].authors.length,2);assert.throws(()=>parseBibliography('@article{x,title=unknown}','bib'),/macros/);assert.throws(()=>parseBibliography('@article{x,title={title}','bib'),/Unclosed/);
});
test('OA acquisition verifies matching PDF and does not download successful work again',async t=>{
 const root=await toolkitFixture(t);await fs.mkdir(path.join(root,'workspace/a'),{recursive:true});const item={id:'synthetic',title:'Synthetic Study',normalized_title:'synthetic study',authors:['Synthetic Author'],year:2030,doi:null,sources:['openalex'],decision:'candidate',reason:'Synthetic fixture',verification:'metadata_only',oa_locations:[{url:'https://example.org/test.pdf',source:'openalex',license:'cc-by',version:'publishedVersion'}]};await fs.writeFile(path.join(root,'workspace/a/literature-manifest.json'),JSON.stringify({schema_version:1,project_id:'a',searches:[],items:[item],updated_at:new Date().toISOString()}));
 let calls=0;const download=async url=>{calls++;return {bytes:makePdf('Synthetic Study provides a sufficiently long synthetic passage for parser validation.'),url};};
 const first=await collectOpenAccess(root,'workspace/a',{download});assert.equal(first.items[0].identity_checked,true);await collectOpenAccess(root,'workspace/a',{download});assert.equal(calls,1);
});
