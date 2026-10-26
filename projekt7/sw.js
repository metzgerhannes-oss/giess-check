const VERSION='klarpunkt-shell-v50';
const SHELL_PREFIX='klarpunkt-shell-v';
const FILES=['./','./index.html','./style.css','./app.mjs','./core.mjs','./storage.mjs','./history.mjs','./unsaved.mjs','./archive.mjs','./archive-transfer.mjs','./backup.mjs','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'];
// Fetch public shell bytes without browser cookies, referrers, cross-origin
// redirects or HTTP credentials. Both install and runtime repair must use
// identical anonymous, same-origin request policy.
// Cache.addAll() otherwise defaults to same-origin credentials.
function publicShellRequests(){
 return FILES.map(path=>new Request(new URL(path,self.registration.scope),{
  credentials:'omit',cache:'reload',mode:'same-origin',
   redirect:'error',referrer:'',referrerPolicy:'no-referrer'
 }));
}
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
 // A public offline response must not carry commands that clear browser data,
 // trigger HTTP refresh navigation or negotiate a private authentication flow.
 // Such headers are unsafe even when the status and MIME appear legitimate.
 if(headers?.get('clear-site-data')||headers?.get('refresh')||
    headers?.get('www-authenticate')||headers?.get('proxy-authenticate'))return false;
 const vary=headers?.get('vary')||'';
 // Only harmless content-negotiation dimensions are safe in a public offline
 // shell. Unknown Vary keys can conceal per-session or authorization variants.
 if(vary&&vary.split(',').some(value=>!/^(?:accept|accept-encoding|accept-language)$/i.test(value.trim())))return false;
 // A full HTTP 200 asset must not carry any range metadata, even a
 // non-byte unit or malformed range that the browser would otherwise accept.
 if((headers?.get('content-range')||'').trim())return false;
 const disposition=headers?.get('content-disposition')||'';
 // Only inline assets belong in an executable offline shell. Unknown or
 // form-data dispositions must not be normalized into a trusted resource.
 if(disposition&&!/^\s*inline(?:\s*(?:;|$))/i.test(disposition))return false;
 if(/^\s*0\s*$/.test(headers?.get('content-length')||''))return false;
 const type=headers?.get('content-type')?.split(';')[0]?.trim().toLowerCase();
 const kind=path==='./'||path.endsWith('.html')?'html':
   path.endsWith('.mjs')||path.endsWith('.js')?'js':
   path.endsWith('.css')?'css':path.endsWith('.svg')?'svg':
   path.endsWith('.png')?'png':'manifest';
 return MIME[kind].includes(type);
}
// CacheStorage.put() can resolve even when a backend silently ignores or
// alters an entry. Metadata-only checks cannot detect a mixed-version shell:
// compare the actual decoded response bodies before removing the durable
// recovery fence. Only invoked during full-shell promotion (not every fetch).
async function sameShellBytes(expected,stored){
 if(!expected||!stored||typeof expected.clone!=='function'||typeof stored.clone!=='function')return false;
 try{
  const [a,b]=await Promise.all([expected.clone().arrayBuffer(),stored.clone().arrayBuffer()]);
  if(!a.byteLength||a.byteLength!==b.byteLength)return false;
  const before=new Uint8Array(a),after=new Uint8Array(b);
  for(let i=0;i<before.length;i++)if(before[i]!==after[i])return false;
  return true;
 }catch{return false;}
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
// If a corrupt runtime write cannot persist its recovery fence and cannot be
// deleted, MIME-complete cache entries are not evidence of safe bytes. Keep
// this worker in fail-closed mode until a fully verified shell is promoted.
let unfencedWriteFailure=false;
// Runtime asset repairs and whole-shell promotion must not write the same
// cache concurrently. An in-flight repair may complete the shell by itself.
const runtimeWrites=new Set();
// Coalesce concurrent anonymous repairs of one shell path; never share a
// mutable cache write between independently fetched resource revisions.
const runtimeRepairs=new Map();
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
  if(unfencedWriteFailure){
   if(requireComplete&&allowFailedRecovery)return null;
   throw new Error('Unfenced offline cache write failure');
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
  if(!unfencedWriteFailure&&!(await pendingPromotion())&&await completeShell(cache)){
   recoveryFailed=false;unfencedWriteFailure=false;return await cache.match('./index.html');
  }
  const staged=await caches.open(RECOVERY_CACHE);
  // A storage backend can acknowledge open() without persisting the cache.
  // Never touch the active shell unless its crash-surviving fence is visible.
  if(!(await pendingPromotion()))throw new Error('Offline recovery fence was not persisted');
  // Staging is the durable fence for a potentially mixed active cache.
  // Never declare a promotion successful before this fence is confirmed gone.
  if(!(await completeShell(staged))){
   // An earlier interrupted addAll may leave stale MIME-correct bytes.
   // Clear and verify all partial entries before refetching a full shell.
   // Keep the staging cache itself as the durable promotion fence.
   for(const path of FILES){
    if(await staged.match(path)){
     if(!(await staged.delete(path))||await staged.match(path)){
      throw new Error('Incomplete offline staging could not be cleared');
     }
    }
   }
   if(!(await pendingPromotion()))throw new Error('Offline recovery fence vanished during staging reset');
   await staged.addAll(publicShellRequests());
   if(!(await completeShell(staged)))throw new Error('Incomplete offline shell in recovery staging');
  }
  // The browser may evict the stage while addAll is running. A complete
  // transient staging object is not evidence of a durable recovery fence.
  if(!(await pendingPromotion()))throw new Error('Offline recovery fence vanished before promotion');
  for(const path of FILES){
   const response=await staged.match(path);
   await cache.put(path,response);
  }
  if(!(await completeShell(cache)))throw new Error('Incomplete offline shell after recovery');
  // The stage must still exist and every active body must match it exactly.
  // Quota eviction, a dropped write or altered bytes leave the fence in place
  // so the next navigation can retry, including offline after worker restart.
  for(const path of FILES){
   const [expected,stored]=await Promise.all([staged.match(path),cache.match(path)]);
   if(!trustedShellAsset(expected,path)||!trustedShellAsset(stored,path)||
      !(await sameShellBytes(expected,stored))){
    throw new Error('Offline shell promotion bytes were not confirmed');
   }
  }
  // A delete rejection, false return, or unexpectedly persistent stage
  // means the promotion has NOT committed. Keep the fence and fail closed;
  // a subsequent navigation (even after worker restart) can retry offline.
  if(!(await caches.delete(RECOVERY_CACHE))||await pendingPromotion()){
   throw new Error('Offline shell recovery fence was not cleared');
  }
  const page=await cache.match('./index.html');
  if(!trustedShellAsset(page,'./index.html'))throw new Error('Offline entrypoint missing after promotion');
  recoveryFailed=false;
  unfencedWriteFailure=false;
  return page;
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
  await cache.addAll(publicShellRequests());
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
 // Top-level navigations normally have credentials='include'; they must
 // remain offline-capable, using the anonymously precached public shell.
 // Explicitly credentialed subresources must not be served from public cache.
 if(request.method!=='GET'||(request.mode!=='navigate'&&request.credentials==='include'))return;
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
  // Cache-only requests must not indirectly join a network operation.
  const ongoing=runtimeRepairs.get(shellPath);
  if(ongoing){
   const shared=await ongoing;
   return typeof shared.clone==='function'?shared.clone():shared;
  }
  const repairing=(async()=>{
  const beforeFetch=shellEpoch;
  // A page-controlled Request can carry arbitrary custom headers. Even with
  // credentials:'omit', forwarding those headers could return a personalized
  // response and persist it in the shared offline shell. Reconstruct a fresh,
  // canonical request with no inherited headers, referrer or client tokens.
  const publicRequest=new Request(new URL(shellPath,self.registration.scope),{
   credentials:'omit',cache:'reload',mode:'same-origin',
   redirect:'error',referrer:'',referrerPolicy:'no-referrer'
  });
  const response=await fetch(publicRequest,{credentials:'omit'});
  // A full recovery may start AND finish while the network request is
  // pending. Never write that pre-recovery response over the validated shell.
  if(recoveryInFlight||shellEpoch!==beforeFetch){
   return promotedRuntimeAsset(cache,request,shellPath);
  }
  // Apply precache MIME, origin and redirect checks to runtime repairs too.
  if(!trustedShellAsset(response,shellPath))return Response.error();
  // Track and await each best-effort write: whole-shell recovery waits for
  // repairs already in flight, but quota failure still permits online use.
  // A successful CacheStorage.put is not proof that the expected bytes were
  // retained. A same-MIME corrupted runtime entry could otherwise be served
  // offline after a worker restart. Keep verification inside runtimeWrites so
  // full-shell promotion waits for it before touching the same cache.
  const writing=(async()=>{
   let writeSucceeded=false;
   try{
    await cache.put(publicRequest,response.clone());
    writeSucceeded=true;
   }catch{
    // A quota failure may leave the online response usable; a late failure
    // may also have persisted bytes, which still need verification.
   }
   if(recoveryInFlight||shellEpoch!==beforeFetch)return;
   let stored=null;
   try{stored=await cache.match(publicRequest);}catch{}
   if(recoveryInFlight||shellEpoch!==beforeFetch)return;
   let confirmed=false;
   if(trustedShellAsset(stored,shellPath))confirmed=await sameShellBytes(response,stored);
   if(recoveryInFlight||shellEpoch!==beforeFetch)return;
   if(!confirmed&&(writeSucceeded||stored)){
    // Persist a recovery fence BEFORE releasing this write. A future worker
    // must not trust a metadata-complete but byte-corrupted offline shell.
    recoveryFailed=true;
    // Until the durable stage is observed, an acknowledged but corrupted
    // cache entry must not be trusted by a later navigation in this worker.
    unfencedWriteFailure=true;
    await caches.open(RECOVERY_CACHE);
    if(await pendingPromotion())unfencedWriteFailure=false;
    if(!(await pendingPromotion())){
     // Without a durable fence a restarted worker could trust the bad entry.
     // Best-effort remove it, then fail closed instead of claiming success.
     try{await cache.delete(publicRequest);}catch{}
     throw new Error('Offline recovery fence could not be persisted');
    }
   }
  })();
  runtimeWrites.add(writing);
  try{await writing;}
  catch{
   // Failure to persist the protective fence must fail closed.
   return Response.error();
  }
  finally{runtimeWrites.delete(writing);}
  // A recovery can start while the CacheStorage write is pending, even if
  // the network response was current when its write began. Never return that
  // pre-promotion response after the shell epoch has changed.
  return recoveryInFlight||shellEpoch!==beforeFetch
   ?promotedRuntimeAsset(cache,request,shellPath):response;
  })();
  runtimeRepairs.set(shellPath,repairing);
  try{return await repairing;}
  finally{if(runtimeRepairs.get(shellPath)===repairing)runtimeRepairs.delete(shellPath);}
 }));
});
