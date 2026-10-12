import {importBibliography} from './bibliography.mjs';
import {createInterface} from 'node:readline';
import {Engine} from './engine.mjs';
import {createResearchProject} from './wizard.mjs';
import {authorizeRun,chatApprove,runWorkflow,stopRun,doctor} from './execution.mjs';
import {createBlueprint,renderBlueprint,previewVideo} from './blueprint.mjs';
import {verifyEvidence} from './evidence.mjs';
import * as fs from 'node:fs/promises';
import {atomicWrite} from './utils.mjs';
import {readJson} from './utils.mjs';
import path from 'node:path';
async function controlLock(root,action){const file=path.join(root,'.research-work/runner.lock');const lock=await fs.open(file,'wx').catch(()=>{throw new Error('Runner busy; stop or wait before changing workflow controls');});try{return await action();}finally{await lock.close();await fs.unlink(file);}}
function confirm(value){if(!value?.text?.trim()||!value?.source?.trim())throw new Error('Actual user text and source required');}
export async function callBridge(root,method,params={}){
 const engine=new Engine(root);
 switch(method){
 case 'new':return createResearchProject(root,params.answers);
 case 'import-bibliography':{const state=await engine.status();return controlLock(root,()=>importBibliography(root,state.project_dir,params.file));}
 case 'status':return engine.status();
 case 'doctor':return doctor(root);
 case 'authorize':return authorizeRun(root,params.proposal,params.confirmation);
 case 'run':return runWorkflow(root);
 case 'resume':return runWorkflow(root,{resume:true});
 case 'stop':return stopRun(root);
 case 'approve':return chatApprove(root,params.kind,params.approval,params.confirmation);
 case 'verify-use':confirm(params.confirmation);return engine.verifyUse(params.task_id,params.specification);
 case 'finalize':confirm(params.confirmation);return engine.finalize({...params.request,human_confirmed:true});
 case 'reopen':confirm(params.confirmation);return engine.reopen({...params.request,human_confirmed:true});
 case 'collect-more':{
  confirm(params.confirmation);return controlLock(root,async()=>{const scopePath=path.join(root,'.research-work/run-scope.json');const scope=await readJson(scopePath);
  if((scope.supplement_rounds_used||0)>=scope.limits.supplement_rounds)throw new Error('Supplement limit reached; narrow research scope or approve a new run scope');
  const result=await engine.collectMore({...params.request,human_confirmed:true});scope.supplement_rounds_used=(scope.supplement_rounds_used||0)+1;await atomicWrite(scopePath,JSON.stringify(scope,null,2));return result;});
 }
 case 'complete':return engine.complete(params.receipt);
 case 'retry':return engine.retry(params.task_id);
 case 'blueprint':return createBlueprint(root,params.plan,params);
 case 'render':return renderBlueprint(root,params.blueprint,{confirmation:params.confirmation,audio:params.audio});
 case 'evidence':return verifyEvidence(root,params.plan,params.ledger);
 default:throw new Error('Unsupported local bridge operation');
 }
}
// JSONL, not a network service. Host selects the fixed root; requests cannot change it.
export async function serveBridge(root,input=process.stdin,output=process.stdout){
 const lines=createInterface({input,crlfDelay:Infinity});for await(const line of lines){let id=null;try{
  if(Buffer.byteLength(line)>2000000)throw new Error('Bridge request too large');const request=JSON.parse(line);id=request.id;
  const result=await callBridge(root,request.method,request.params);output.write(JSON.stringify({id,result})+'\n');
 }catch(error){output.write(JSON.stringify({id,error:error.message})+'\n');}}
}
