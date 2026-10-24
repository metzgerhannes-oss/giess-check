import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
export const LIVE_ASSETS=['index.html','style.css','app.mjs','core.mjs','storage.mjs','history.mjs','unsaved.mjs','archive.mjs','archive-transfer.mjs','backup.mjs','sw.js','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validatePagesUrl(raw){
 const url=new URL(raw);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.endsWith('.github.io')||url.pathname.includes('..'))throw new Error('HTTPS GitHub Pages URL required');
 if(!url.pathname.endsWith('/'))url.pathname+='/';
 return url;
}
export async function verifyPublishedAssets(base,localRoot,fetcher=fetch){
 const url=validatePagesUrl(base);
 return Promise.all(LIVE_ASSETS.map(async asset=>{
  const target=new URL(asset,url);
  target.searchParams.set('_verify',String(Date.now()));
  const response=await fetcher(target.toString(),{cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(asset+': HTTP '+response.status);
  if(new URL(response.url).origin!==url.origin)throw new Error(asset+': unexpected redirect origin');
  const actual=Buffer.from(await response.arrayBuffer());
  const expected=await readFile(resolve(localRoot,asset));
  if(digest(actual)!==digest(expected))throw new Error(asset+': published content differs from checkout');
  return asset;
 }));
}
