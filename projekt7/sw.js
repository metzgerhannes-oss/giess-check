const VERSION='klarpunkt-shell-v15';
const FILES=['./','./index.html','./style.css','./app.mjs','./core.mjs','./storage.mjs','./history.mjs','./unsaved.mjs','./archive.mjs','./archive-transfer.mjs','./backup.mjs','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'];
// Cache only this app's immutable shell paths, never arbitrary data or URL variants.
const STATIC_PATHS=new Set(FILES.map(path=>new URL(path,self.registration.scope).pathname));
// A 200 response may still be an HTML login or fallback page rather than an asset.
const MIME={
 html:['text/html'],js:['text/javascript','application/javascript','text/ecmascript','application/ecmascript'],
 css:['text/css'],svg:['image/svg+xml'],png:['image/png'],
 manifest:['application/manifest+json','application/json','application/octet-stream','text/plain']
};
function trustedShellAsset(response,path){
 if(!response||!response.ok||response.redirected||
    (response.type!=='basic'&&response.type!=='default'))return false;
 if(response.url!==new URL(path,self.registration.scope).href)return false;
 const type=response.headers?.get('content-type')?.split(';')[0]?.trim().toLowerCase();
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
 const url=new URL(request.url);
 const scope=new URL(self.registration.scope);
 if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 if(request.mode==='navigate'){
  const index=new URL('./index.html',scope);
  // Version-pinned navigation prevents fresh HTML with stale cached JS/CSS.
  if(url.pathname!==scope.pathname&&url.pathname!==index.pathname)return;
  event.respondWith(caches.open(VERSION).then(cache=>cache.match('./index.html')).then(hit=>hit||fetch(request)));
  return;
 }
 if(url.search||!STATIC_PATHS.has(url.pathname))return;
 event.respondWith(caches.open(VERSION).then(cache=>cache.match(request).then(hit=>hit||fetch(request).then(response=>{
  // A captive portal, external redirect, opaque response or error page must
  // never replace a missing trusted asset in the persistent offline shell.
  if(response.ok&&!response.redirected&&(response.type==='basic'||response.type==='default')&&response.url===request.url){
   const copy=response.clone();cache.put(request,copy).catch(()=>{});
  }
  return response;
 }))));
});
