const VERSION='klarpunkt-shell-v23';
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
 const vary=headers?.get('vary')||'';
 if(vary.split(',').some(value=>/^(?:\*|cookie|authorization|proxy-authorization|origin)$/i.test(value.trim())))return false;
 if(/^\s*bytes\s+\d+-\d+\/(?:\d+|\*)/i.test(headers?.get('content-range')||''))return false;
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
// Recover an evicted shell as one complete batch. Cache.addAll is atomic in
// browsers: a failed download cannot replace an existing partial/working set.
// Navigation is served only after all required files pass the same trust gate.
let recoveryInFlight=null;
async function recoverShell(cache){
 if(!recoveryInFlight)recoveryInFlight=(async()=>{
  await cache.addAll(FILES);
  if(!(await completeShell(cache)))throw new Error('Incomplete offline shell after recovery');
  return cache.match('./index.html');
 })();
 const active=recoveryInFlight;
 try{return await active;}
 finally{if(recoveryInFlight===active)recoveryInFlight=null;}
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
  if(!(await completeShell(cache)))throw new Error('Incomplete offline shell at activation');
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('klarpunkt-shell-')&&key!==VERSION).map(key=>caches.delete(key)));
  await self.clients.claim();
 }));
});
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
   const hit=await cache.match('./index.html');
   // Never execute poisoned HTML. A full, validated online recovery may repair it.
   // An index alone is not an offline app: check every asset before serving it.
   if(hit&&trustedShellAsset(hit,'./index.html')&&await completeShell(cache))return hit;
   try{
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
  const hit=await cache.match(request);
  // Revalidate cache hits: entries may change after the activation check.
  if(trustedShellAsset(hit,shellPath))return hit;
  const response=await fetch(request);
  // Apply precache MIME, origin and redirect checks to runtime repairs too.
  if(!trustedShellAsset(response,shellPath))return Response.error();
  // A fetch event may end as soon as its response settles. Await the
  // best-effort cache write so a repaired asset is actually durable before
  // delivery; a quota/permission failure must still allow online use.
  try{await cache.put(request,response.clone());}
  catch{ /* Online delivery remains possible; offline navigation still checks the full shell. */ }
  return response;
 }));
});
