import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const shellVersion=source.match(/^const VERSION='(klarpunkt-shell-v\d+)';/m)?.[1];
assert.ok(shellVersion,'Offline shell version must be declared');
const oldShellVersion='klarpunkt-shell-v'+(Number(shellVersion.split('-v').at(-1))-1);
const scope='https://example.test/giess-check/projekt7/';
const shell=['./','./index.html','./style.css','./app.mjs','./core.mjs','./storage.mjs','./history.mjs','./unsaved.mjs','./archive.mjs','./archive-transfer.mjs','./backup.mjs','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'];
function worker({missing=null,failPrecache=false,networkResponse=null,failPut=false,badPrecache=null,holdPut=false}={}){
 const handlers=new Map(),versions=new Map(),deleted=[];
 const current=shellVersion,old=oldShellVersion;
 const oldEntries=new Map(shell.map(path=>[new URL(path,scope).href,{old:true}]));
 versions.set(old,oldEntries);versions.set('unrelated-app',new Map());
 let waiting=0,claimed=0,networkCalls=0,putCalls=0,addAllCalls=0;
 let precacheShouldFail=failPrecache;
 let releasePut;
 const putBarrier=holdPut?new Promise(resolve=>{releasePut=resolve;}):null;
 const keyOf=req=>new URL(typeof req==='string'?req:req.url,scope).href;
 const caches={
  open:async name=>{
   if(!versions.has(name))versions.set(name,new Map());
   const entries=versions.get(name);
   return {
    match:async req=>entries.get(keyOf(req)),
    addAll:async files=>{
     addAllCalls++;
     // Model atomic Cache.addAll: stage all entries before committing.
     const staged=new Map(entries);
     for(const path of files){
      if(path!==missing){
       const mime=path==='./'||path.endsWith('.html')?'text/html':
         path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':
         path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/manifest+json';
       const fault=badPrecache?.path===path?badPrecache:null;
       staged.set(keyOf(path),{
        ok:fault?.ok??true,status:fault?.status??200,redirected:fault?.redirected??false,
        type:fault?.type??'basic',url:fault?.url??keyOf(path),
        headers:{get:name=>fault?.headers?.[name]??(name==='content-type'?fault?.mime??mime:null)}
       });
      }
     }
     if(precacheShouldFail)throw Error('Precache failed');
     entries.clear();
     for(const [key,value] of staged)entries.set(key,value);
    },
    put:async(req,response)=>{
     putCalls++;
     if(putBarrier)await putBarrier;
     if(failPut)throw Error('QuotaExceededError');
     entries.set(keyOf(req),response);
    }
   };
  },
  keys:async()=>[...versions.keys()],
  delete:async name=>{deleted.push(name);return versions.delete(name);}
 };
 const self={
  registration:{scope},addEventListener:(type,fn)=>handlers.set(type,fn),
  skipWaiting:async()=>{waiting++;},clients:{claim:async()=>{claimed++;}}
 };
 const fetch=async req=>{
  networkCalls++;
  const path=shell.find(item=>keyOf(item)===req.url)||'./index.html';
  const mime=path==='./'||path.endsWith('.html')?'text/html':
    path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':
    path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/manifest+json';
  return networkResponse?networkResponse(req):{
   ok:true,status:200,redirected:false,type:'basic',url:req.url,
   headers:{get:()=>mime},clone(){return this;}
  };
 };
 runInNewContext(source,{self,caches,fetch,URL,Set,Response:{error:()=>({networkError:true})}});
 const lifecycle=type=>{
  let promise;
  handlers.get(type)({waitUntil:p=>{promise=p;}});
  assert.ok(promise,type+' must wait for integrity gate');
  return promise;
 };
 const request=(path,options={})=>({url:new URL(path,scope).href,method:'GET',mode:'cors',...options});
 const dispatch=req=>{
  let response;
  handlers.get('fetch')({request:req,respondWith:p=>{response=p;}});
  return response;
 };
 return {
  lifecycle,request,dispatch,versions,deleted,
  setPrecacheFailure:value=>{precacheShouldFail=value;},
  releasePut:()=>releasePut?.(),
  get waiting(){return waiting;},get claimed(){return claimed;},
  get networkCalls(){return networkCalls;},get putCalls(){return putCalls;},get addAllCalls(){return addAllCalls;}
 };
}
test('complete precache permits activation and removes only older app versions',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 assert.equal(sw.waiting,1);
 await sw.lifecycle('activate');
 assert.equal(sw.claimed,1);
 assert.deepEqual(sw.deleted,[oldShellVersion]);
 assert.equal(sw.versions.has('unrelated-app'),true);
 assert.equal(sw.versions.get(shellVersion).size,shell.length);
});
test('failed precache never skips waiting or removes a previous offline version',async()=>{
 const sw=worker({failPrecache:true});
 await assert.rejects(sw.lifecycle('install'),/Precache failed/);
 assert.equal(sw.waiting,0);
 assert.equal(sw.versions.has(oldShellVersion),true);
 assert.deepEqual(sw.deleted,[]);
});
test('partial precache fails closed rather than installing a broken shell',async()=>{
 const sw=worker({missing:'./core.mjs'});
 await assert.rejects(sw.lifecycle('install'),/Incomplete offline shell/);
 assert.equal(sw.waiting,0);
 assert.equal(sw.versions.has(oldShellVersion),true);
});
test('activation with evicted current asset preserves older complete shell',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./app.mjs',scope).href);
 await assert.rejects(sw.lifecycle('activate'),/Incomplete offline shell/);
 assert.equal(sw.claimed,0);
 assert.deepEqual(sw.deleted,[]);
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});
test('precache rejects wrong MIME, redirects, foreign URLs and opaque responses without evicting old shell',async()=>{
 const faults=[
  {path:'./app.mjs',mime:'text/html'},
  {path:'./style.css',redirected:true},
  {path:'./core.mjs',url:'https://login.example.test/'},
  {path:'./index.html',type:'opaque'},
  {path:'./icon-192.png',ok:false},
  {path:'./core.mjs',status:206},
  {path:'./app.mjs',headers:{'cache-control':'private, max-age=60'}},
  {path:'./style.css',headers:{'cache-control':'no-cache'}},
  {path:'./core.mjs',headers:{vary:'Cookie'}},
  {path:'./icon.svg',headers:{vary:'Authorization'}}
 ];
 for(const badPrecache of faults){
  const sw=worker({badPrecache});
  await assert.rejects(sw.lifecycle('install'),/Incomplete offline shell/);
  assert.equal(sw.waiting,0);
  assert.equal(sw.versions.has(oldShellVersion),true);
  assert.deepEqual(sw.deleted,[]);
 }
});
test('activation refuses a poisoned cached shell and keeps previous offline version',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 const url=new URL('./app.mjs',scope).href;
 sw.versions.get(shellVersion).get(url).headers.get=()=> 'text/html';
 await assert.rejects(sw.lifecycle('activate'),/Incomplete offline shell/);
 assert.equal(sw.claimed,0);
 assert.deepEqual(sw.deleted,[]);
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});
test('redirected asset responses fail closed and are never persisted',async()=>{
 const sw=worker({networkResponse:req=>({
  ok:true,status:200,redirected:true,type:'basic',url:'https://login.example.test/',clone(){return this;}
 })});
 const response=await sw.dispatch(sw.request('./app.mjs'));
 assert.deepEqual(response,{networkError:true});
 assert.equal(sw.putCalls,0);
 assert.equal(sw.versions.get(shellVersion).size,0);
});
test('opaque, mismatched-URL and failed network responses are never cached',async()=>{
 for(const response of [
  {ok:true,status:200,redirected:false,type:'opaque',url:scope+'app.mjs'},
  {ok:true,status:200,redirected:false,type:'basic',url:scope+'other.mjs'},
  {ok:false,status:500,redirected:false,type:'basic',url:scope+'app.mjs'}
 ]){
  const sw=worker({networkResponse:()=>({...response,clone(){return this;}})});
  await sw.dispatch(sw.request('./app.mjs'));
  assert.equal(sw.putCalls,0);
 }
});
test('valid same-origin response repairs one missing asset without caching URL variants',async()=>{
 const sw=worker();
 const req=sw.request('./app.mjs');
 const response=await sw.dispatch(req);
 assert.equal(response.ok,true);
 assert.equal(sw.putCalls,1);
 assert.equal(sw.versions.get(shellVersion).has(req.url),true);
 await sw.dispatch(req);
 assert.equal(sw.networkCalls,1);
 assert.equal(sw.dispatch(sw.request('./app.mjs?version=2')),undefined);
 assert.equal(sw.dispatch(sw.request('./private.json')),undefined);
});
test('failed runtime cache write does not prevent online delivery',async()=>{
 const sw=worker({failPut:true});
 const response=await sw.dispatch(sw.request('./style.css'));
 assert.equal(response.ok,true);
 assert.equal(sw.putCalls,1);
 assert.equal(sw.versions.get(shellVersion).size,0);
});


test('runtime repair rejects a login HTML response served as JavaScript',async()=>{
 const sw=worker({networkResponse:req=>({
  ok:true,status:200,redirected:false,type:'basic',url:req.url,
  headers:{get:()=> 'text/html'},clone(){return this;}
 })});
 const response=await sw.dispatch(sw.request('./app.mjs'));
 assert.deepEqual(response,{networkError:true},'Invalid JavaScript response must fail closed');
 assert.equal(sw.putCalls,0,'Wrong MIME must never enter persistent cache');
});
test('runtime repair rejects HTML disguised as CSS, SVG, PNG or manifest',async()=>{
 for(const path of ['./style.css','./icon.svg','./icon-192.png','./manifest.webmanifest']){
  const sw=worker({networkResponse:req=>({
   ok:true,status:200,redirected:false,type:'basic',url:req.url,
   headers:{get:()=> 'text/html'},clone(){return this;}
  })});
  await sw.dispatch(sw.request(path));
  assert.equal(sw.putCalls,0,path);
 }
});
test('poisoned cached module is bypassed and replaced by trusted network response',async()=>{
 const sw=worker(),req=sw.request('./app.mjs');
 await sw.lifecycle('install');
 const poisoned={ok:true,status:200,redirected:false,type:'basic',url:req.url,headers:{get:()=> 'text/html'}};
 sw.versions.get(shellVersion).set(req.url,poisoned);
 const response=await sw.dispatch(req);
 assert.notEqual(response,poisoned);
 assert.equal(sw.networkCalls,1);
 assert.equal(sw.putCalls,1);
 assert.equal(sw.versions.get(shellVersion).get(req.url),response);
});
test('poisoned cached module is not served when the network fails',async()=>{
 const sw=worker({networkResponse:()=>{throw Error('Offline');}}),req=sw.request('./app.mjs');
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).set(req.url,{
  ok:true,status:200,redirected:false,type:'basic',url:req.url,headers:{get:()=> 'text/html'}
 });
 await assert.rejects(sw.dispatch(req),/Offline/);
 assert.equal(sw.putCalls,0);
});
test('poisoned cached HTML never executes and is replaced only by complete trusted recovery',async()=>{
 const sw=worker(),req=sw.request('./index.html',{mode:'navigate'});
 await sw.lifecycle('install');
 const poisoned={ok:true,status:200,redirected:false,type:'basic',url:req.url,headers:{get:()=> 'text/javascript'}};
 sw.versions.get(shellVersion).set(req.url,poisoned);
 sw.setPrecacheFailure(true);
 assert.deepEqual(await sw.dispatch(req),{networkError:true},'Offline poisoned HTML must not execute');
 assert.equal(sw.versions.get(shellVersion).get(req.url),poisoned,'Failed recovery must not overwrite cached HTML');
 sw.setPrecacheFailure(false);
 const page=await sw.dispatch(req);
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.notEqual(page,poisoned);
 assert.equal(sw.versions.get(shellVersion).size,shell.length);
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length,'Old shell must survive recovery');
});
test('empty shell is recovered as a complete validated batch before navigation',async()=>{
 const sw=worker();
 const page=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(sw.versions.get(shellVersion).size,shell.length);
 assert.equal(sw.addAllCalls,1);
 assert.equal(sw.networkCalls,0,'Navigation must not mix cached and network assets');
 const offline=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 assert.equal(offline,page);
 assert.equal(sw.addAllCalls,1,'Healthy offline shell must not redownload');
});
test('partially evicted shell is fully restored before cached HTML is served',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const page=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(sw.addAllCalls,2);
 assert.equal(sw.versions.get(shellVersion).size,shell.length);
});
test('failed offline recovery fails closed and retains the previous shell',async()=>{
 const sw=worker({failPrecache:true});
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate'})),{networkError:true});
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
 assert.equal(sw.waiting,0);
 assert.deepEqual(sw.deleted,[]);
});
test('invalid MIME during recovery never exposes partial HTML',async()=>{
 const sw=worker({badPrecache:{path:'./app.mjs',mime:'text/html'}});
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate'})),{networkError:true});
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
 assert.equal(sw.waiting,0);
});
test('simultaneous navigation attempts share one recovery batch',async()=>{
 const sw=worker();
 const req=sw.request('./index.html',{mode:'navigate'});
 const [a,b]=await Promise.all([sw.dispatch(req),sw.dispatch(req)]);
 assert.equal(a.headers.get('content-type'),'text/html');
 assert.equal(b.headers.get('content-type'),'text/html');
 assert.equal(sw.addAllCalls,1);
});

test('transient offline recovery failure preserves cached entries and can retry online',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 const entries=sw.versions.get(shellVersion);
 entries.delete(new URL('./core.mjs',scope).href);
 const before=new Map(entries);
 sw.setPrecacheFailure(true);
 const req=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(req),{networkError:true});
 assert.deepEqual([...entries.keys()],[...before.keys()],'Failed addAll must not replace cached assets');
 assert.equal(sw.addAllCalls,2);
 sw.setPrecacheFailure(false);
 const page=await sw.dispatch(req);
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(entries.size,shell.length);
 assert.equal(sw.addAllCalls,3);
 assert.equal(await sw.dispatch(req),page);
 assert.equal(sw.addAllCalls,3,'Recovered shell must not download again');
});
test('empty shell recovers after a temporary outage without touching unrelated caches',async()=>{
 const sw=worker({failPrecache:true});
 const req=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(req),{networkError:true});
 assert.equal(sw.versions.get(shellVersion).size,0,'Atomic failure cannot leave partial shell');
 assert.equal(sw.versions.get('unrelated-app').size,0);
 sw.setPrecacheFailure(false);
 const page=await sw.dispatch(req);
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(sw.versions.get(shellVersion).size,shell.length);
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});

test('partial HTTP 206 is rejected during runtime repair even when ok is true',async()=>{
 const sw=worker({networkResponse:req=>({
  ok:true,status:206,redirected:false,type:'basic',url:req.url,
  headers:{get:()=> 'text/javascript'},clone(){return this;}
 })});
 assert.deepEqual(await sw.dispatch(sw.request('./app.mjs')),{networkError:true});
 assert.equal(sw.putCalls,0);
});

test('untrusted CSS, images and manifest responses fail closed instead of reaching the browser',async()=>{
 for(const path of ['./style.css','./icon.svg','./icon-192.png','./manifest.webmanifest']){
  const sw=worker({networkResponse:req=>({
   ok:true,status:200,redirected:false,type:'basic',url:req.url,
   headers:{get:()=> 'text/html'},clone(){return this;}
  })});
  assert.deepEqual(await sw.dispatch(sw.request(path)),{networkError:true},path);
  assert.equal(sw.putCalls,0,path);
 }
});

test('poisoned HTML plus untrusted recovery fails closed without deleting old cache',async()=>{
 const sw=worker({badPrecache:{path:'./index.html',mime:'text/javascript'}});
 await assert.rejects(sw.lifecycle('install'),/Incomplete offline shell/);
 const req=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(req),{networkError:true});
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
 assert.equal(sw.claimed,0);
});


test('runtime cache repair completes its write before delivering an online asset',async()=>{
 const sw=worker({holdPut:true}),req=sw.request('./app.mjs');
 let delivered=false;
 const pending=sw.dispatch(req).then(response=>{delivered=true;return response;});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.putCalls,1,'Cache write must start for a trusted repair');
 assert.equal(delivered,false,'Browser must not end the fetch event before cache persistence');
 assert.equal(sw.versions.get(shellVersion).size,0);
 sw.releasePut();
 const response=await pending;
 assert.equal(response.ok,true);
 assert.equal(sw.versions.get(shellVersion).get(req.url),response);
 const offline=await sw.dispatch(req);
 assert.equal(offline,response,'The completed repair must be available without a second download');
 assert.equal(sw.networkCalls,1);
});

test('a delayed quota failure still delivers the trusted online response without corrupting cache',async()=>{
 const sw=worker({holdPut:true,failPut:true}),req=sw.request('./style.css');
 let delivered=false;
 const pending=sw.dispatch(req).then(response=>{delivered=true;return response;});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.putCalls,1);
 assert.equal(delivered,false);
 sw.releasePut();
 const response=await pending;
 assert.equal(response.ok,true,'Quota failure must not block online usage');
 assert.equal(sw.versions.get(shellVersion).size,0,'Failed write cannot create a partial cache entry');
});

test('long offline session reuses a complete shell without network or cache writes',async()=>{
 const sw=worker({networkResponse:()=>{throw Error('Network unavailable');}});
 await sw.lifecycle('install');
 await sw.lifecycle('activate');
 const initialSize=sw.versions.get(shellVersion).size;
 for(let i=0;i<120;i++){
  const path=i%3===0?'./app.mjs':i%3===1?'./style.css':'./core.mjs';
  const response=await sw.dispatch(sw.request(path));
  assert.equal(response.ok,true,'Offline asset read '+i);
  if(i%10===0){
   const page=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
   assert.equal(page.headers.get('content-type'),'text/html');
  }
 }
 assert.equal(sw.networkCalls,0,'A healthy long-running offline session must not fetch');
 assert.equal(sw.putCalls,0,'Healthy cached assets must not be rewritten');
 assert.equal(sw.addAllCalls,1,'No recovery should be needed for a healthy shell');
 assert.equal(sw.versions.get(shellVersion).size,initialSize);
});
