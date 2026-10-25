const VERSION='klarpunkt-shell-v34';
const SHELL_PREFIX='klarpunkt-shell-v';
const FILES=['./','./index.html','./style.css','./app.mjs','./core.mjs','./storage.mjs','./history.mjs','./unsaved.mjs','./archive.mjs','./archive-transfer.mjs','./backup.mjs','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'];
// Cache only this app's immutable shell paths, never arbitrary data or URL variants.
const STATIC_PATHS=new Set(FILES.map(path=>new URL(path,self.registration.scope).pathname));
const PATH_BY_PATHNAME=new Map(FILES.map(path=>[new URL(path,self.registration.scope).pathname,path]));
// A 200 response may still be an HTML login or fallback page rather than an asset.
const MIME={
 html:['text/html'],js:['text/javascript','application/javascript','text/ecmascript','application/ecmascript'],
 css:['text/css'],svg:['image/svg+xml'],png:['image/png'],
 manifest:['application/manifest+json','application/json','application/octet-stream','text/plain']
};
function trustedShellAsset(response,path){
 if(!response||!response.ok||response.status!==200||response.redirected||
    (response.type!=='basic'&&response.type!=='default'))return false;
 if(response.url!==new URL(path,self.registration.scope).href)return false;
 // Shell resources must be public, complete, and safe to persist offline.
 // Reject responses that explicitly prohibit storage, depend on an unbounded
 // Vary key, represent partial content, or are marked as downloads.
 const headers=response.headers;
 const cacheControl=headers?.get('cache-control')||'';
 // A static offline shell must not persist a response requiring revalidation
 // or a response scoped to a particular user's session.
 if(cacheControl.split(',').some(value=>/^(?:no-store|no-cache|private)(?:\s*(?:=|$))/i.test(value.trim())))return false;
 // Never persist session-setting responses in a public offline shell.
 if(headers?.get('set-cookie')||headers?.get('set-cookie2'))return false;
 const vary=headers?.get('vary')||'';
 // Only harmless content-negotiation dimensions are safe in a public offline
 // shell. Unknown Vary keys can conceal per-session or authorization variants.
 if(vary&&vary.split(',').some(value=>!/^(?:accept|accept-encoding|accept-language)$/i.test(value.trim())))return false;
 // A full HTTP 200 asset must not carry any range metadata, even a
 // non-byte unit or malformed range that the browser would otherwise accept.
 if((headers?.get('content-range')||'').trim())return false;
 if(/^\s*attachment(?:\s*;|$)/i.test(headers?.get('content-disposition')||''))return false;
 if(/^\s*0\s*$/.test(headers?.get('content-length')||''))return false;
 const type=headers?.get('content-type')?.split(';')[0]?.trim().toLowerCase();
 const kind=path==='./'||path.endsWith('.html')?'html':
   path.endsWith('.mjs')||path.endsWith('.js')?'js':
   path.endsWith('.css')?'css':path.endsWith('.svg')?'svg':
   path.endsWith('.png')?'png':'manifest';
 return MIME[kind].includes(type);
}
async function completeShell(cache){
 // Never replace a working older shell with a partial or poisoned cache.
 const matches=await Promise.all(FILES.map(path=>cache.match(path)));
 return matches.every((response,index)=>trustedShellAsset(response,FILES[index]));
}
// Stage recovery in an isolated cache: a successful HTTP 200 may still have
// the wrong MIME or origin. Never poison a partially healthy current release
// before the entire replacement has passed the same trust gate as install.
// Promotion cannot be atomic across CacheStorage entries: failed writes still
// fail closed, and the preceding release is never modified.
const RECOVERY_CACHE=VERSION+'-recovery';
// A leftover staging cache is a durable warning that promotion may have
// stopped after writing some (or even all) active entries. MIME checks alone
// cannot distinguish a mixed-version shell after a worker restart.
async function pendingPromotion(){
 return (await caches.keys()).includes(RECOVERY_CACHE);
}
let recoveryInFlight=null;
// Increment before and after every recovery. A delayed cache read or network
// response must never be delivered across a whole-shell promotion.
let shellEpoch=0;
let recoveryFailed=false;
// Runtime asset repairs and whole-shell promotion must not write the same
// cache concurrently. An in-flight repair may complete the shell by itself.
const runtimeWrites=new Set();
async function stableCacheHit(cache,path,{requireComplete=false,allowFailedRecovery=false}={}){
 for(let attempt=0;attempt<5;attempt++){
  const pending=recoveryInFlight;
  if(pending)await pending;
  const epoch=shellEpoch;
  const hit=await cache.match(path);
  const pendingStage=await pendingPromotion();
  const complete=!requireComplete||(hit&&await completeShell(cache));
  // CacheStorage reads are async: a promotion can begin and finish while a
  // match is pending. Discard the old response and retry against the new epoch.
  if(recoveryInFlight||epoch!==shellEpoch)continue;
  // Never serve a possibly mixed shell merely because every URL exists.
  // Navigations may reconcile the durable stage; static reads fail closed.
  if(pendingStage){
   if(requireComplete&&allowFailedRecovery)return null;
   throw new Error('Unfinished offline shell promotion');
  }
  if(recoveryFailed&&!allowFailedRecovery)throw new Error('Offline recovery failed');
  // A failed promotion may have durably written its final entry before the
  // browser reported an error. Only a complete, epoch-stable navigation check
  // can clear the sticky failure; individual static hits cannot prove safety.
  if(recoveryFailed&&allowFailedRecovery&&requireComplete&&complete)recoveryFailed=false;
  return complete?hit:null;
 }
 throw new Error('Offline shell changed during cache read');
}
async function recoverShell(cache){
 if(!recoveryInFlight){
  shellEpoch++;
  recoveryInFlight=(async()=>{
   try{
  await Promise.allSettled([...runtimeWrites]);
  if(!(await pendingPromotion())&&await completeShell(cache)){
   recoveryFailed=false;return await cache.match('./index.html');
  }
  const staged=await caches.open(RECOVERY_CACHE);
  let verifiedStage=false, promoted=false;
  try{
   // A previous worker may have crashed or hit quota halfway through
   // promotion. Reuse only a complete, validated staging shell: this permits
   // an offline retry after a restart without trusting partial active entries.
   verifiedStage=await completeShell(staged);
   if(!verifiedStage){
    await staged.addAll(FILES);
    verifiedStage=await completeShell(staged);
    if(!verifiedStage)throw new Error('Incomplete offline shell in recovery staging');
   }
   for(const path of FILES){
    const response=await staged.match(path);
    await cache.put(path,response);
   }
   if(!(await completeShell(cache)))throw new Error('Incomplete offline shell after recovery');
   promoted=true;
   const page=await cache.match('./index.html');
   recoveryFailed=false;
   return page;
  }finally{
   // Retain staging on EVERY failure, including invalid/redownload-failed
   // staging: after a restart we cannot prove whether an earlier worker
   // already wrote a mixed active shell. A future navigation must reconcile
   // the stage rather than trusting a metadata-complete active cache.
   // Only a fully promoted shell permits removal of this durable fence.
   if(promoted){
    try{await caches.delete(RECOVERY_CACHE);}catch{}
   }
  }
   }catch(error){
    recoveryFailed=true;
    throw error;
   }finally{
    shellEpoch++;
   }
  })();
 }
 const active=recoveryInFlight;
 try{return await active;}
 finally{if(recoveryInFlight===active)recoveryInFlight=null;}
}
// Retain one preceding release while old workers finish in-flight fetches.
// Prune only older, canonical app cache names; never touch foreign/newer caches.
// Cache cleanup failures must not strand a complete new offline shell.
async function pruneOlderShells(){
 const current=Number(VERSION.slice(SHELL_PREFIX.length));
 const names=await caches.keys();
 const older=names.map(key=>({key,match:/^klarpunkt-shell-v([1-9]\d*)$/.exec(key)}))
  .filter(({match})=>match&&Number.isSafeInteger(Number(match[1]))&&Number(match[1])<current)
  .sort((a,b)=>Number(b.match[1])-Number(a.match[1]));
 // Crashed recovery workers can leave orphaned staging caches. Keep the
 // preceding release's staging cache while its worker may still be active.
 const orphaned=names.filter(key=>{
  const match=/^klarpunkt-shell-v([1-9]\d*)-recovery$/.exec(key);
  return match&&Number.isSafeInteger(Number(match[1]))&&Number(match[1])<current-1;
 });
 await Promise.allSettled([...older.slice(1).map(({key})=>key),...orphaned].map(key=>caches.delete(key)));
}
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(VERSION).then(async cache=>{
  await cache.addAll(FILES);
  if(!(await completeShell(cache)))throw new Error('Incomplete offline shell after precache');
  await self.skipWaiting();
 }));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.open(VERSION).then(async cache=>{
  // Never delete previous working offline versions if the new shell was evicted.
  if(await pendingPromotion()||!(await completeShell(cache)))throw new Error('Incomplete offline shell at activation (or unreconciled promotion)');
  await pruneOlderShells();
  await self.clients.claim();
 }));
});
// Runtime writes may resolve AFTER a navigation has started whole-shell
// promotion. In that case the old network response is not safe to deliver:
// re-read the epoch-stable promoted asset instead, or fail closed.
async function promotedRuntimeAsset(cache,request,shellPath){
 try{
  const current=await stableCacheHit(cache,request);
  return trustedShellAsset(current,shellPath)?current:Response.error();
 }catch{return Response.error();}
}
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 // Do not collapse authenticated or byte-range requests into a public
 // uncredentialed shell-cache response. Let the network handle them.
 if(request.cache==='no-store'||['authorization','cookie','range','if-range','if-none-match','if-modified-since','if-match','if-unmodified-since'].some(name=>request.headers?.has?.(name)))return;
 const url=new URL(request.url);
 const scope=new URL(self.registration.scope);
 if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||url.search)return;
 if(request.mode==='navigate'){
  const index=new URL('./index.html',scope);
  // Version-pinned navigation prevents fresh HTML with stale cached JS/CSS.
  if(url.pathname!==scope.pathname&&url.pathname!==index.pathname)return;
  event.respondWith(caches.open(VERSION).then(async cache=>{
   try{
    // Recheck both the page and complete asset set after any concurrent
    // promotion; a delayed read must not serve the pre-recovery HTML.
    const hit=await stableCacheHit(cache,'./index.html',{
     requireComplete:true,allowFailedRecovery:true
    });
    if(hit&&trustedShellAsset(hit,'./index.html'))return hit;
    // A cache-only request must not trigger an implicit network recovery.
    if(request.cache==='only-if-cached')return Response.error();
    const restored=await recoverShell(cache);
    return trustedShellAsset(restored,'./index.html')?restored:Response.error();
   }catch{
    // Fail closed: partial cached assets could mix incompatible releases.
    return Response.error();
   }
  }));
  return;
 }
 if(!STATIC_PATHS.has(url.pathname))return;
 event.respondWith(caches.open(VERSION).then(async cache=>{
  const shellPath=PATH_BY_PATHNAME.get(url.pathname);
  let hit;
  try{hit=await stableCacheHit(cache,request);}
  catch{return Response.error();}
  if(trustedShellAsset(hit,shellPath))return hit;
  if(request.cache==='only-if-cached')return Response.error();
  const beforeFetch=shellEpoch;
  const response=await fetch(request);
  // A full recovery may start AND finish while the network request is
  // pending. Never write that pre-recovery response over the validated shell.
  if(recoveryInFlight||shellEpoch!==beforeFetch){
   return promotedRuntimeAsset(cache,request,shellPath);
  }
  // Apply precache MIME, origin and redirect checks to runtime repairs too.
  if(!trustedShellAsset(response,shellPath))return Response.error();
  // Track and await each best-effort write: whole-shell recovery waits for
  // repairs already in flight, but quota failure still permits online use.
  let writing;
  try{writing=cache.put(request,response.clone());}
  catch{
   return recoveryInFlight||shellEpoch!==beforeFetch
    ?promotedRuntimeAsset(cache,request,shellPath):response;
  }
  runtimeWrites.add(writing);
  try{await writing;}
  catch{ /* An online response is usable only if no whole-shell promotion raced. */ }
  finally{runtimeWrites.delete(writing);}
  // A recovery can start while the CacheStorage write is pending, even if
  // the network response was current when its write began. Never return that
  // pre-promotion response after the shell epoch has changed.
  return recoveryInFlight||shellEpoch!==beforeFetch
   ?promotedRuntimeAsset(cache,request,shellPath):response;
 }));
});
