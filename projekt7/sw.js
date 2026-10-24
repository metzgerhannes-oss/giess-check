const VERSION='klarpunkt-shell-v8';
const FILES=['./','./index.html','./style.css','./app.mjs','./core.mjs','./storage.mjs','./history.mjs','./archive.mjs','./archive-transfer.mjs','./backup.mjs','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'];
self.addEventListener('install',event=>{
 // A failed precache prevents activation, preserving the previous complete shell.
 event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('klarpunkt-shell-')&&key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
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
 event.respondWith(caches.open(VERSION).then(cache=>cache.match(request).then(hit=>hit||fetch(request).then(response=>{
  if(response.ok){const copy=response.clone();cache.put(request,copy).catch(()=>{});}
  return response;
 }))));
});
