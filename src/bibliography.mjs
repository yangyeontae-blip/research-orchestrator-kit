import * as fs from 'node:fs/promises';
import path from 'node:path';
import {Engine} from './engine.mjs';
import {deduplicateLiterature,normalizeTitle,normalizeDoi} from './literature.mjs';
import {readJson,writeJson,isoNow} from './utils.mjs';
export function parseBibliography(text,format){
 const records=[];
 if(format==='ris'){
  for(const block of text.split(/^ER\s*-.*$/m)){if(!block.trim())continue;const fields={};let last;
   for(const line of block.split(/\r?\n/)){const m=line.match(/^([A-Z0-9]{2})\s*-\s?(.*)$/);if(m){last=m[1];(fields[last]||=[]).push(m[2]);}else if(line.trim()&&last)fields[last][fields[last].length-1]+=' '+line.trim();}
   if(!fields.TI&&!fields.T1)throw new Error('RIS title missing');records.push({title:(fields.TI||fields.T1)[0],authors:fields.AU||fields.A1||[],year:parseInt((fields.PY||fields.Y1||[])[0])||null,doi:(fields.DO||[])[0],venue:(fields.JO||fields.JF||fields.T2||[])[0],url:(fields.UR||[])[0]});
  }
 }else if(format==='bib'){
  let pos=0;while(pos<text.length){const match=/@([a-z]+)\s*\{/ig;match.lastIndex=pos;const entry=match.exec(text);if(!entry)break;if(['string','preamble','comment'].includes(entry[1].toLowerCase()))throw new Error('BibTeX macros/preamble unsupported; export expanded bibliography');pos=match.lastIndex;const comma=text.indexOf(',',pos);if(comma<0)throw new Error('Invalid BibTeX entry');pos=comma+1;const fields={};let closed=false;
   while(pos<text.length){while(/[\s,]/.test(text[pos]||'')&&pos<text.length)pos++;if(text[pos]==='}'){pos++;closed=true;break;}const key=/^([a-z_]+)\s*=\s*/i.exec(text.slice(pos));if(!key)throw new Error('Unsupported BibTeX syntax');pos+=key[0].length;const opener=text[pos];let value='';
    if(opener==='{'||opener==='"'){pos++;let depth=1;while(pos<text.length&&depth){const ch=text[pos++];if(ch==='\\'&&pos<text.length){value+=ch+text[pos++];continue;}if(opener==='{'&&ch==='{')depth++;if(opener==='{'&&ch==='}'||opener==='"'&&ch==='"')depth--;if(depth)value+=ch;}if(depth)throw new Error('Unclosed BibTeX value');}
    else{const number=/^\d+/.exec(text.slice(pos));if(!number)throw new Error('BibTeX string macros unsupported');value=number[0];pos+=value.length;}
    fields[key[1].toLowerCase()]=value;
   }
   if(!closed)throw new Error('Unclosed BibTeX entry');if(!fields.title)throw new Error('BibTeX title missing');records.push({title:fields.title,authors:(fields.author||'').split(/\s+and\s+/).filter(Boolean),year:Number(fields.year)||null,doi:fields.doi,venue:fields.journal||fields.booktitle,url:fields.url});
  }
 }else throw new Error('Import supports .ris and .bib');
 if(!records.length)throw new Error('No bibliography records');return records.map(r=>({...r,doi:normalizeDoi(r.doi),normalized_title:normalizeTitle(r.title),sources:['user'],decision:'candidate',verification:'metadata_only',reason:'User bibliography import; original source not verified',url:r.url&&/^https?:\/\//.test(r.url)?r.url:null}));
}
export async function importBibliography(root,project,file){const binding=await new Engine(root).artifact(file);const text=await fs.readFile(path.join(root,binding.path),'utf8');if(text.length>2000000)throw new Error('Bibliography size limit');const records=parseBibliography(text,path.extname(file).slice(1).toLowerCase());const target=path.join(root,project,'literature-manifest.json');const manifest=await readJson(target);manifest.items=deduplicateLiterature([...manifest.items,...records]);manifest.updated_at=isoNow();await writeJson(target,manifest);return {imported:records.length,total:manifest.items.length,source:binding,verification:'metadata_only'};}
