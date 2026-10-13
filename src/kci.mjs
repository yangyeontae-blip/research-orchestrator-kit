// Official field contract: KCI articleSearch, checked 2026-10-12.
// https://www.kci.go.kr/kciportal/po/openapi/openDataView.kci?datasetBean.dtstSeqNo=1
const decode=value=>value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'').replace(/&(?:amp|lt|gt|quot|apos);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[x])).trim();
const values=(xml,tag)=>[...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,'g'))].map(m=>decode(m[1]));
export function parseKci(xml){
 if(xml.length>2000000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unsupported KCI XML');
 const records=[...xml.matchAll(/<record(?:\s[^>]*)?>([\s\S]*?)<\/record>/g)];
 if(!records.length&&!/<total>\s*0\s*<\/total>/.test(xml))throw new Error('KCI returned an error or unknown response format');
 return records.map(([,r])=>{const year=Number(values(r,'pub-year')[0]);const url=values(r,'url')[0]||null;return {title:values(r,'article-title')[0]||'',authors:values(r,'author'),year:Number.isInteger(year)&&year>0?year:null,doi:values(r,'doi')[0]||null,venue:values(r,'journal-name')[0]||null,url:url&&/^https?:\/\//.test(url)?url:null,sources:['kci']};}).filter(r=>r.title);
}
export async function searchKci(query,{key=process.env.KCI_API_KEY,fetchImpl=fetch,rows=20}={}){
 if(!key)throw new Error('KCI_API_KEY unavailable; Korean literature coverage limited');
 const url=new URL('https://open.kci.go.kr/po/openapi/openApiSearch.kci');url.search=new URLSearchParams({apiCode:'articleSearch',key,title:query,page:'1',displayCount:String(Math.min(rows,50))});
 let text='';
 try{const response=await fetchImpl(url.href,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('HTTP error');text=await response.text();return parseKci(text);}
 catch{
  // KCI answers errors with HTTP 200 and <resultMsg> (checked live 2026-10-13: "등록되지 않은 key 입니다."); show that reason, never the key.
  const reason=values(text,'resultMsg')[0]?.slice(0,120).replace(key,'[key]');
  throw new Error(`KCI request failed${reason?`: ${reason}`:' or unsupported response'}; check official API access. Credentials are not logged.`);
 }
}
