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
function worker({missing=null,failPrecache=false,networkResponse=null,failPut=false,failPutAt=null,badPrecache=null,holdPut=false,failDelete=false,sharedVersions=null,failPutAfterWriteAt=null,skipPutAt=null,corruptPutAt=null,evictStageAt=null,ignoreRecoveryOpen=false,failEntryDelete=false,workerSource=source,version=shellVersion}={}){
 const handlers=new Map(),versions=sharedVersions??new Map(),deleted=[];
 const current=version,old='klarpunkt-shell-v'+(Number(version.split('-v').at(-1))-1);
 const oldEntries=new Map(shell.map(path=>[new URL(path,scope).href,{old:true}]));
 if(!versions.has(old))versions.set(old,oldEntries);
 if(!versions.has('unrelated-app'))versions.set('unrelated-app',new Map());
 let waiting=0,claimed=0,networkCalls=0,putCalls=0,addAllCalls=0;
 let precacheShouldFail=failPrecache,precacheFault=badPrecache,putShouldFail=failPut;
 let ignoreRecoveryOpenNow=ignoreRecoveryOpen,failEntryDeleteNow=failEntryDelete;
 let deleteFault=failDelete?'throw':'none';
 let holdMatchPath=null,holdFetchPath=null,releaseMatch=null,releaseFetch=null;
 let releasePut;
 const putBarrier=holdPut?new Promise(resolve=>{releasePut=resolve;}):null;
 const keyOf=req=>new URL(typeof req==='string'?req:req.url,scope).href;
 const caches={
  open:async name=>{
   // Fault injection: CacheStorage.open() resolves but the recovery cache
   // never appears in keys(), simulating a silently non-durable fence.
   if(!versions.has(name)&&!(ignoreRecoveryOpenNow&&name===current+'-recovery'))versions.set(name,new Map());
   const entries=versions.get(name)??new Map();
   return {
    match:async req=>{
     const snapshot=entries.get(keyOf(req));
     if(name===current&&holdMatchPath===keyOf(req)){
      holdMatchPath=null;
      await new Promise(resolve=>{releaseMatch=resolve;});
     }
     return snapshot;
    },
    addAll:async files=>{
     addAllCalls++;
     // Model atomic Cache.addAll: stage all entries before committing.
     const staged=new Map(entries);
     for(const resource of files){
      const path=shell.find(candidate=>keyOf(candidate)===keyOf(resource));
      assert.ok(path,'Only canonical shell URLs may be precached');
      assert.equal(resource.credentials,'omit','Precache must never send cookies');
      assert.equal(resource.cache,'reload','Precache must fetch current shell bytes');
      assert.equal(resource.mode,'same-origin','Precache must not follow cross-origin requests');
      assert.equal(resource.redirect,'error','Precache must reject redirects');
      assert.equal(resource.referrer,'','Precache must not inherit the page referrer');
      assert.equal(resource.referrerPolicy,'no-referrer','Precache must never transmit a referrer');
      if(path!==missing){
       const mime=path==='./'||path.endsWith('.html')?'text/html':
         path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':
         path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/manifest+json';
       const fault=precacheFault?.path===path?precacheFault:null;
       staged.set(keyOf(path),{
        ok:fault?.ok??true,status:fault?.status??200,redirected:fault?.redirected??false,
        type:fault?.type??'basic',url:fault?.url??keyOf(path),
        headers:{get:name=>fault?.headers?.[name]??(name==='content-type'?fault?.mime??mime:null)},
        bodyBytes:path+':'+current+':batch-'+addAllCalls,
        clone(){return this;},
        async arrayBuffer(){return new TextEncoder().encode(this.bodyBytes).buffer;}
       });
      }
     }
     if(precacheShouldFail)throw Error('Precache failed');
     entries.clear();
     for(const [key,value] of staged)entries.set(key,value);
    },
    delete:async req=>failEntryDeleteNow?false:entries.delete(keyOf(req)),
    put:async(req,response)=>{
     putCalls++;
     if(putBarrier)await putBarrier;
     if(putShouldFail||(failPutAt!==null&&putCalls===failPutAt))throw Error('QuotaExceededError');
     // Simulate silent acknowledgement, same-MIME corruption and stage
     // eviction without throwing: all must leave promotion uncommitted.
     if(skipPutAt!==putCalls){
      entries.set(keyOf(req),corruptPutAt===putCalls
       ?{...response,bodyBytes:response.bodyBytes+'-tampered'}:response);
     }
     if(evictStageAt===putCalls)versions.get(current+'-recovery')?.delete(keyOf('./style.css'));
     // Simulate a storage backend that persists bytes but reports a late
     // failure: successful persistence is not the same as a resolved Promise.
     if(failPutAfterWriteAt!==null&&putCalls===failPutAfterWriteAt)throw Error('Late storage failure');
    }
   };
  },
  keys:async()=>[...versions.keys()],
  delete:async name=>{
   deleted.push(name);
   if(deleteFault==='throw')throw Error('Cache deletion denied');
   if(deleteFault==='false')return false;
   if(deleteFault==='stale')return true;
   return versions.delete(name);
  }
 };
 const self={
  registration:{scope},addEventListener:(type,fn)=>handlers.set(type,fn),
  skipWaiting:async()=>{waiting++;},clients:{claim:async()=>{claimed++;}}
 };
 const fetch=async req=>{
  networkCalls++;
  if(holdFetchPath===req.url){
   holdFetchPath=null;
   await new Promise(resolve=>{releaseFetch=resolve;});
  }
  const path=shell.find(item=>keyOf(item)===req.url)||'./index.html';
  const mime=path==='./'||path.endsWith('.html')?'text/html':
    path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':
    path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/manifest+json';
  return networkResponse?networkResponse(req):{
   ok:true,status:200,redirected:false,type:'basic',url:req.url,
   headers:{get:name=>name==='content-type'?mime:null},
   bodyBytes:'runtime:'+req.url,
   clone(){return this;},
   async arrayBuffer(){return new TextEncoder().encode(this.bodyBytes).buffer;}
  };
 };
 runInNewContext(workerSource,{self,caches,fetch,URL,Request,Set,Response:{error:()=>({networkError:true})}});
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
  setPutFailure:value=>{putShouldFail=value;},
  setDeleteFault:value=>{deleteFault=value;},
  setBadPrecache:value=>{precacheFault=value;},
  setIgnoreRecoveryOpen:value=>{ignoreRecoveryOpenNow=value;},
  setEntryDeleteFailure:value=>{failEntryDeleteNow=value;},
  releasePut:()=>releasePut?.(),
  pauseNextMatch:path=>{holdMatchPath=keyOf(path);releaseMatch=null;},
  releaseMatch:()=>releaseMatch?.(),
  pauseNextFetch:path=>{holdFetchPath=keyOf(path);releaseFetch=null;},
  releaseFetch:()=>releaseFetch?.(),
  get matchPaused(){return Boolean(releaseMatch);},
  get fetchPaused(){return Boolean(releaseFetch);},
  get waiting(){return waiting;},get claimed(){return claimed;},
  get networkCalls(){return networkCalls;},get putCalls(){return putCalls;},get addAllCalls(){return addAllCalls;}
 };
}
test('complete precache permits activation and retains the immediately previous shell',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 assert.equal(sw.waiting,1);
 await sw.lifecycle('activate');
 assert.equal(sw.claimed,1);
 assert.deepEqual(sw.deleted,[]);
 assert.equal(sw.versions.has(oldShellVersion),true,'Previous shell must remain for in-flight old-worker fetches');
 assert.equal(sw.versions.has('unrelated-app'),true);
 assert.equal(sw.versions.get(shellVersion).size,shell.length);
});
test('activation retains one previous release, prunes older releases and ignores foreign or future caches',async()=>{
 const sw=worker(),version=Number(shellVersion.split('-v').at(-1));
 const stale1='klarpunkt-shell-v'+(version-3),stale2='klarpunkt-shell-v'+(version-2);
 const future='klarpunkt-shell-v'+(version+1),lookalike='klarpunkt-shell-vbad';
 for(const key of [stale1,stale2,future,lookalike])sw.versions.set(key,new Map());
 await sw.lifecycle('install');
 await sw.lifecycle('activate');
 assert.deepEqual([...sw.deleted].sort(),[stale1,stale2].sort());
 for(const key of [shellVersion,oldShellVersion,future,lookalike,'unrelated-app']){
  assert.equal(sw.versions.has(key),true,key+' must not be deleted');
 }
 assert.equal(sw.claimed,1);
});
test('failed stale-cache cleanup never prevents a complete new shell from activating',async()=>{
 const sw=worker({failDelete:true});
 sw.versions.set('klarpunkt-shell-v1',new Map());
 await sw.lifecycle('install');
 await sw.lifecycle('activate');
 assert.equal(sw.claimed,1,'Cleanup errors must not strand a fully installed worker');
 assert.deepEqual(sw.deleted,['klarpunkt-shell-v1']);
 assert.equal(sw.versions.has(oldShellVersion),true);
 assert.equal(sw.versions.has(shellVersion),true);
});
test('retained previous release is not mistaken for the active offline shell',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 await sw.lifecycle('activate');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 sw.setPrecacheFailure(true);
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate'})),{networkError:true});
 assert.equal(sw.versions.has(oldShellVersion),true,'Previous cache survives an offline outage');
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
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
  {path:'./icon.svg',headers:{vary:'Authorization'}},
  {path:'./app.mjs',headers:{vary:'X-Session-Token'}}
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
 assert.equal(sw.versions.has(shellVersion+'-recovery'),true,'Failed staging remains a durable recovery fence');
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


test('untrusted staged recovery cannot replace any existing active-shell entries',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 const entries=sw.versions.get(shellVersion);
 entries.delete(new URL('./core.mjs',scope).href);
 const before=[...entries.entries()];
 sw.setBadPrecache({path:'./app.mjs',mime:'text/html'});
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate'})),{networkError:true});
 assert.deepEqual([...entries.entries()],before,'Staging must validate before touching active cache');
 assert.equal(sw.putCalls,0,'Invalid staged response must never be promoted');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),true,'Failed staging must remain as a durable recovery fence');
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});

test('successful staged recovery promotes the complete shell and removes staging',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const page=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(sw.putCalls,shell.length,'Every asset must be promoted after validation');
 assert.equal(sw.versions.get(shellVersion).size,shell.length);
 assert.equal(sw.versions.has(shellVersion+'-recovery'),false);
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});

test('quota failure during staged promotion fails closed without evicting old release',async()=>{
 const sw=worker({failPut:true});
 await sw.lifecycle('install');
 const entries=sw.versions.get(shellVersion);
 entries.delete(new URL('./core.mjs',scope).href);
 const before=[...entries.entries()];
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate'})),{networkError:true});
 assert.deepEqual([...entries.entries()],before,'Failed first promotion write preserves active entries');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),true,'Verified staging must survive a failed promotion');
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
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

test('concurrent static requests wait for staged promotion before reading the active cache',async()=>{
 const sw=worker({holdPut:true});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const navigation=sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.putCalls,1,'Promotion must be paused on its first write');
 let delivered=false;
 const asset=sw.dispatch(sw.request('./app.mjs')).then(value=>{delivered=true;return value;});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(delivered,false,'Static asset must wait for promotion, not serve stale cache');
 assert.equal(sw.networkCalls,0,'No competing runtime repair during promotion');
 sw.releasePut();
 const [page,script]=await Promise.all([navigation,asset]);
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(script.headers.get('content-type'),'text/javascript');
 assert.equal(sw.versions.get(shellVersion).size,shell.length);
});
test('failed concurrent promotion does not expose stale static assets',async()=>{
 const sw=worker({holdPut:true,failPut:true});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const navigation=sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 await new Promise(resolve=>setImmediate(resolve));
 const asset=sw.dispatch(sw.request('./app.mjs'));
 sw.releasePut();
 assert.deepEqual(await navigation,{networkError:true});
 assert.deepEqual(await asset,{networkError:true});
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});
test('recovery drains a pending runtime repair and avoids unnecessary restaging',async()=>{
 const sw=worker({holdPut:true});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const repairing=sw.dispatch(sw.request('./core.mjs'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.putCalls,1);
 const navigation=sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.addAllCalls,1,'Recovery must wait for the existing repair');
 sw.releasePut();
 const [asset,page]=await Promise.all([repairing,navigation]);
 assert.equal(asset.headers.get('content-type'),'text/javascript');
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(sw.addAllCalls,1,'Completed repair avoids a redundant shell download');
 assert.equal(sw.versions.get(shellVersion).size,shell.length);
});
test('activation prunes orphaned staging caches but retains previous-worker staging',async()=>{
 const sw=worker(),version=Number(shellVersion.split('-v').at(-1));
 const orphan='klarpunkt-shell-v'+(version-2)+'-recovery';
 const previous=oldShellVersion+'-recovery';
 const future='klarpunkt-shell-v'+(version+1)+'-recovery';
 for(const key of [orphan,previous,future,'unrelated-app-recovery'])sw.versions.set(key,new Map());
 await sw.lifecycle('install');
 await sw.lifecycle('activate');
 assert.equal(sw.versions.has(orphan),false);
 for(const key of [previous,future,'unrelated-app-recovery',oldShellVersion]){
  assert.equal(sw.versions.has(key),true,key+' must be retained');
 }
});

test('validated staging survives quota failure and retries without a network download',async()=>{
 const sw=worker({failPut:true});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const req=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(req),{networkError:true});
 assert.equal(sw.versions.get(shellVersion+'-recovery').size,shell.length);
 sw.setPutFailure(false);
 sw.setPrecacheFailure(true);
 const page=await sw.dispatch(req);
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(sw.addAllCalls,2,'Retry must reuse validated staging without downloading');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),false);
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});

test('interrupted mid-promotion can finish offline after a worker restart',async()=>{
 const sw=worker({failPutAt:5});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const req=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(req),{networkError:true});
 assert.equal(sw.putCalls,5);
 assert.equal(sw.versions.get(shellVersion+'-recovery').size,shell.length);
 const restarted=worker({sharedVersions:sw.versions,failPrecache:true});
 const page=await restarted.dispatch(req);
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(restarted.addAllCalls,0,'A new worker must not need the network');
 assert.equal(restarted.versions.has(shellVersion+'-recovery'),false);
 assert.equal(restarted.versions.get(shellVersion).size,shell.length);
 assert.equal(restarted.versions.get(oldShellVersion).size,shell.length);
});

test('poisoned leftover staging is revalidated and replaced before promotion',async()=>{
 const sw=worker({failPut:true});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const req=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(req),{networkError:true});
 const staged=sw.versions.get(shellVersion+'-recovery');
 staged.get(new URL('./app.mjs',scope).href).headers.get=()=> 'text/html';
 sw.setPutFailure(false);
 const page=await sw.dispatch(req);
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(sw.addAllCalls,3,'Poisoned staging must be replaced with a validated batch');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),false);
});

test('failed re-download of poisoned staging retains its recovery fence and old release',async()=>{
 const sw=worker({failPut:true});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const req=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(req),{networkError:true});
 const staged=sw.versions.get(shellVersion+'-recovery');
 staged.get(new URL('./app.mjs',scope).href).headers.get=()=> 'text/html';
 sw.setPutFailure(false);
 sw.setPrecacheFailure(true);
 assert.deepEqual(await sw.dispatch(req),{networkError:true});
 assert.equal(sw.versions.has(shellVersion+'-recovery'),true);
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});

test('delayed cached asset read cannot return pre-promotion bytes',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 const entries=sw.versions.get(shellVersion);
 const url=new URL('./app.mjs',scope).href;
 const stale=entries.get(url);
 entries.delete(new URL('./core.mjs',scope).href);
 sw.pauseNextMatch('./app.mjs');
 const asset=sw.dispatch(sw.request('./app.mjs'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.matchPaused,true);
 const page=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 assert.equal(page.ok,true);
 sw.releaseMatch();
 const refreshed=await asset;
 assert.equal(refreshed,entries.get(url));
 assert.notEqual(refreshed,stale,'Old cached bytes must not escape after promotion');
 assert.equal(sw.networkCalls,0);
});

test('delayed cached asset read fails closed after interrupted promotion',async()=>{
 const sw=worker({failPutAt:4});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 sw.pauseNextMatch('./app.mjs');
 const asset=sw.dispatch(sw.request('./app.mjs'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.matchPaused,true);
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate'})),{networkError:true});
 sw.releaseMatch();
 assert.deepEqual(await asset,{networkError:true});
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
 assert.equal(sw.versions.has(shellVersion+'-recovery'),true);
});

test('delayed navigation read rechecks complete shell after concurrent promotion',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 const entries=sw.versions.get(shellVersion);
 const url=new URL('./index.html',scope).href;
 const stale=entries.get(url);
 entries.delete(new URL('./core.mjs',scope).href);
 sw.pauseNextMatch('./index.html');
 const first=sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.matchPaused,true);
 const second=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 assert.equal(second.ok,true);
 sw.releaseMatch();
 const page=await first;
 assert.equal(page,entries.get(url));
 assert.notEqual(page,stale);
 assert.equal(sw.addAllCalls,2,'Second navigation must perform the only recovery');
});

test('delayed network repair cannot overwrite a newly promoted offline asset',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 const entries=sw.versions.get(shellVersion);
 const url=new URL('./app.mjs',scope).href;
 entries.delete(url);
 entries.delete(new URL('./core.mjs',scope).href);
 sw.pauseNextFetch('./app.mjs');
 const repairing=sw.dispatch(sw.request('./app.mjs'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.fetchPaused,true);
 const page=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 assert.equal(page.ok,true);
 const writes=sw.putCalls;
 sw.releaseFetch();
 const asset=await repairing;
 assert.equal(asset,entries.get(url),'Recovered asset wins over stale network fetch');
 assert.equal(sw.putCalls,writes,'Stale repair must not write after promotion');
});

test('delayed network repair fails closed after a failed shell promotion',async()=>{
 const sw=worker({failPutAt:3});
 await sw.lifecycle('install');
 const entries=sw.versions.get(shellVersion);
 const url=new URL('./app.mjs',scope).href;
 entries.delete(url);
 entries.delete(new URL('./core.mjs',scope).href);
 sw.pauseNextFetch('./app.mjs');
 const repairing=sw.dispatch(sw.request('./app.mjs'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.fetchPaused,true);
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate'})),{networkError:true});
 const writes=sw.putCalls;
 sw.releaseFetch();
 assert.deepEqual(await repairing,{networkError:true});
 assert.equal(sw.putCalls,writes,'No stale write after failed recovery');
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});

test('late final promotion failure remains closed until a full shell is revalidated',async()=>{
 const sw=worker({failPutAfterWriteAt:shell.length});
 await sw.lifecycle('install');
 const entries=sw.versions.get(shellVersion);
 entries.delete(new URL('./core.mjs',scope).href);
 const navigate=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(navigate),{networkError:true});
 assert.equal(sw.putCalls,shell.length);
 assert.equal(entries.size,shell.length,'Late error happened after all entries were durable');
 assert.deepEqual(await sw.dispatch(sw.request('./app.mjs')),{networkError:true},
  'One trusted asset cannot clear a previous failed recovery');
 const page=await sw.dispatch(navigate);
 assert.equal(page.headers.get('content-type'),'text/html');
 const [script,css]=await Promise.all([
  sw.dispatch(sw.request('./app.mjs')),sw.dispatch(sw.request('./style.css'))
 ]);
 assert.equal(script.headers.get('content-type'),'text/javascript');
 assert.equal(css.headers.get('content-type'),'text/css');
 assert.equal(sw.addAllCalls,2,'Complete durable shell must not be downloaded again');
 assert.equal(sw.networkCalls,0);
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});

test('incomplete failed promotion never becomes trusted through static cache hits',async()=>{
 const sw=worker({failPutAt:5});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const navigate=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(navigate),{networkError:true});
 for(const path of ['./app.mjs','./style.css','./index.html']){
  const req=sw.request(path,{mode:path.endsWith('.html')?'navigate':'cors',cache:'only-if-cached'});
  assert.deepEqual(await sw.dispatch(req),{networkError:true},path);
 }
 assert.equal(sw.networkCalls,0);
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});

test('restart refuses metadata-complete active shell after a late final promotion error',async()=>{
 const sw=worker({failPutAfterWriteAt:shell.length});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const navigate=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(navigate),{networkError:true});
 assert.equal(sw.versions.get(shellVersion).size,shell.length,
  'Every active URL exists, but the promotion was not committed');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),true);
 const restarted=worker({sharedVersions:sw.versions,failPrecache:true});
 for(const path of ['./app.mjs','./style.css']){
  assert.deepEqual(await restarted.dispatch(restarted.request(path,{cache:'only-if-cached'})),
   {networkError:true},path+' must not leak a potentially mixed shell');
 }
 assert.deepEqual(await restarted.dispatch(restarted.request('./index.html',{
  mode:'navigate',cache:'only-if-cached'
 })),{networkError:true});
 assert.equal(restarted.networkCalls,0);
 const page=await restarted.dispatch(navigate);
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(restarted.addAllCalls,0,'Complete staging must be reused offline');
 assert.equal(restarted.versions.has(shellVersion+'-recovery'),false);
 const script=await restarted.dispatch(restarted.request('./app.mjs',{cache:'only-if-cached'}));
 assert.equal(script.headers.get('content-type'),'text/javascript');
 assert.equal(restarted.versions.get(oldShellVersion).size,shell.length);
});

test('invalid leftover stage cannot silently unlock a complete active shell',async()=>{
 const sw=worker({failPutAfterWriteAt:shell.length});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const navigate=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(navigate),{networkError:true});
 const staged=sw.versions.get(shellVersion+'-recovery');
 staged.get(new URL('./app.mjs',scope).href).headers.get=()=> 'text/html';
 const restarted=worker({sharedVersions:sw.versions,failPrecache:true});
 assert.deepEqual(await restarted.dispatch(navigate),{networkError:true});
 assert.equal(restarted.versions.has(shellVersion+'-recovery'),true,
  'A failed replacement must not erase the only persistent promotion fence');
 assert.deepEqual(await restarted.dispatch(restarted.request('./app.mjs')),
  {networkError:true});
 assert.equal(restarted.networkCalls,0);
 assert.equal(restarted.versions.get(oldShellVersion).size,shell.length);
});

test('a valid stage reconciles an active shell even when every asset URL exists',async()=>{
 const sw=worker({failPutAfterWriteAt:shell.length});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const navigate=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(navigate),{networkError:true});
 const restarted=worker({sharedVersions:sw.versions,failPrecache:true});
 const page=await restarted.dispatch(navigate);
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(restarted.putCalls,shell.length,
  'The active cache must be repromoted, not accepted solely by MIME metadata');
 assert.equal(restarted.networkCalls,0);
 assert.equal(restarted.versions.has(shellVersion+'-recovery'),false);
});

for(const [label,writeFault] of [
 ['successful',{}],
 ['quota-rejected',{failPutAt:1}],
 ['persisted-but-rejected',{failPutAfterWriteAt:1}]
]){
 test('pending '+label+' runtime write cannot serve stale bytes after concurrent shell promotion',async()=>{
  const sw=worker({
   holdPut:true,...writeFault,
   networkResponse:req=>({
    ok:true,status:200,redirected:false,type:'basic',url:req.url,
    headers:{get:name=>name==='content-type'?'text/javascript':null},
    staleRuntime:true,clone(){return this;}
   })
  });
  await sw.lifecycle('install');
  const entries=sw.versions.get(shellVersion);
  const appUrl=new URL('./app.mjs',scope).href;
  entries.delete(appUrl);
  entries.delete(new URL('./core.mjs',scope).href);
  const pendingAsset=sw.dispatch(sw.request('./app.mjs'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sw.putCalls,1,'Runtime write must be pending');
  const navigation=sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
  // Let recovery enter its durable promotion fence while the runtime write
  // remains pending. The recovery must drain that write before restaging.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sw.addAllCalls,1,'Staging must wait for pending runtime writes');
  sw.releasePut();
  const [asset,page]=await Promise.all([pendingAsset,navigation]);
  assert.equal(page.headers.get('content-type'),'text/html');
  assert.equal(sw.addAllCalls,2,'A second missing asset forces whole-shell recovery');
  assert.equal(asset,entries.get(appUrl),'Runtime response must be the promoted cache asset');
  assert.equal(asset.staleRuntime,undefined,'Pre-promotion network bytes must not escape');
  assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
 });
}

for(const [label,deleteFault] of [
 ['throws','throw'],
 ['reports failure','false'],
 ['reports success but leaves stage behind','stale']
]){
 test('offline promotion '+label+' during fence cleanup remains blocked until an offline retry',async()=>{
  const sw=worker();
  await sw.lifecycle('install');
  const entries=sw.versions.get(shellVersion);
  entries.delete(new URL('./core.mjs',scope).href);
  const navigation=sw.request('./index.html',{mode:'navigate'});
  sw.setDeleteFault(deleteFault);
  assert.deepEqual(await sw.dispatch(navigation),{networkError:true},
   'An uncommitted promotion must never serve the entrypoint');
  assert.equal(entries.size,shell.length,'All active entries may be present despite an uncommitted fence');
  assert.equal(sw.versions.has(shellVersion+'-recovery'),true,
   'The durable recovery fence must remain until a confirmed commit');
  assert.deepEqual(await sw.dispatch(sw.request('./app.mjs',{cache:'only-if-cached'})),
   {networkError:true},'Static cache-only reads cannot bypass the fence');
  const restarted=worker({sharedVersions:sw.versions,failPrecache:true});
  assert.deepEqual(await restarted.dispatch(restarted.request('./style.css',{cache:'only-if-cached'})),
   {networkError:true},'A restarted worker must also honor the durable fence');
  const page=await restarted.dispatch(navigation);
  assert.equal(page.headers.get('content-type'),'text/html');
  assert.equal(restarted.networkCalls,0);
  assert.equal(restarted.addAllCalls,0,'A verified stage must recover without network or re-download');
  assert.equal(restarted.versions.has(shellVersion+'-recovery'),false);
  const asset=await restarted.dispatch(restarted.request('./app.mjs',{cache:'only-if-cached'}));
  assert.equal(asset.headers.get('content-type'),'text/javascript');
  assert.equal(restarted.versions.has(oldShellVersion),true);
 });
}

test('credentialed browser navigation remains offline-capable with an anonymously precached shell',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 const page=await sw.dispatch(sw.request('./index.html',{mode:'navigate',credentials:'include',cache:'only-if-cached'}));
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(sw.networkCalls,0,'Offline navigation must not require a credentialed network fetch');
});


test('silent cache write acknowledgement cannot commit a mixed-version shell',async()=>{
 const sw=worker({skipPutAt:1});
 await sw.lifecycle('install');
 const entries=sw.versions.get(shellVersion);
 entries.delete(new URL('./core.mjs',scope).href);
 const navigate=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(navigate),{networkError:true});
 assert.equal(entries.size,shell.length,'MIME-complete active cache can still mix versions');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),true,'Durable fence must remain');
 assert.equal(sw.addAllCalls,2);
 const restored=await sw.dispatch(navigate);
 assert.equal(restored.headers.get('content-type'),'text/html');
 assert.equal(sw.addAllCalls,2,'Validated stage is reused without another download');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),false);
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});

test('same-MIME tampering after a successful put fails byte verification and recovers offline after restart',async()=>{
 const sw=worker({corruptPutAt:3});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const navigate=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(navigate),{networkError:true});
 assert.equal(sw.versions.get(shellVersion).size,shell.length);
 assert.equal(sw.versions.has(shellVersion+'-recovery'),true);
 const restarted=worker({sharedVersions:sw.versions,failPrecache:true});
 const restored=await restarted.dispatch(navigate);
 assert.equal(restored.headers.get('content-type'),'text/html');
 assert.equal(restarted.addAllCalls,0,'No network restaging when a complete stage survives');
 assert.equal(restarted.networkCalls,0);
 assert.equal(restarted.versions.has(shellVersion+'-recovery'),false);
});

test('staging eviction during promotion cannot release the offline fence',async()=>{
 const sw=worker({evictStageAt:shell.length});
 await sw.lifecycle('install');
 sw.versions.get(shellVersion).delete(new URL('./core.mjs',scope).href);
 const navigate=sw.request('./index.html',{mode:'navigate'});
 assert.deepEqual(await sw.dispatch(navigate),{networkError:true});
 assert.equal(sw.versions.get(shellVersion).size,shell.length,
  'All active entries may survive while the source stage was evicted');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),true);
 const restarted=worker({sharedVersions:sw.versions,failPrecache:true});
 assert.deepEqual(await restarted.dispatch(navigate),{networkError:true},
  'Offline restart must not trust an unverifiable promotion');
 assert.equal(restarted.versions.has(shellVersion+'-recovery'),true);
 assert.equal(restarted.versions.get(oldShellVersion).size,shell.length);
});

test('verified runtime repair keeps the durable recovery fence absent',async()=>{
 const sw=worker();
 const asset=await sw.dispatch(sw.request('./app.mjs'));
 assert.equal(asset.ok,true);
 assert.equal(sw.versions.has(shellVersion+'-recovery'),false);
 assert.equal((await sw.dispatch(sw.request('./app.mjs',{cache:'only-if-cached'}))).ok,true);
});

test('silently ignored runtime write creates a restart-surviving offline fence',async()=>{
 const sw=worker({skipPutAt:1});
 const asset=await sw.dispatch(sw.request('./app.mjs'));
 assert.equal(asset.ok,true,'Verified online response remains usable');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),true);
 assert.deepEqual(await sw.dispatch(sw.request('./app.mjs',{cache:'only-if-cached'})),{networkError:true});
 const restarted=worker({sharedVersions:sw.versions,failPrecache:true});
 assert.deepEqual(await restarted.dispatch(restarted.request('./index.html',{mode:'navigate'})),{networkError:true});
 assert.equal(restarted.versions.has(shellVersion+'-recovery'),true);
 assert.equal(restarted.versions.get(oldShellVersion).size,shell.length);
});

test('same-MIME runtime corruption cannot become a trusted offline asset after restart',async()=>{
 const sw=worker({corruptPutAt:1});
 await sw.lifecycle('install');
 const appUrl=new URL('./app.mjs',scope).href;
 sw.versions.get(shellVersion).delete(appUrl);
 const online=await sw.dispatch(sw.request('./app.mjs'));
 assert.equal(online.ok,true);
 assert.equal(sw.versions.has(shellVersion+'-recovery'),true);
 const restarted=worker({sharedVersions:sw.versions,failPrecache:true});
 assert.deepEqual(await restarted.dispatch(restarted.request('./app.mjs',{cache:'only-if-cached'})),{networkError:true});
 assert.deepEqual(await restarted.dispatch(restarted.request('./index.html',{mode:'navigate'})),{networkError:true});
 restarted.setPrecacheFailure(false);
 const recovered=await restarted.dispatch(restarted.request('./index.html',{mode:'navigate'}));
 assert.equal(recovered.headers.get('content-type'),'text/html');
 assert.equal(restarted.versions.has(shellVersion+'-recovery'),false);
 assert.equal(restarted.versions.get(oldShellVersion).size,shell.length);
});

test('non-persistent recovery cache blocks promotion before any active writes',async()=>{
 const sw=worker({ignoreRecoveryOpen:true});
 await sw.lifecycle('install');
 const entries=sw.versions.get(shellVersion);
 entries.delete(new URL('./core.mjs',scope).href);
 const before=[...entries.entries()];
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate'})),
  {networkError:true});
 assert.equal(sw.putCalls,0,'Never promote when the staging fence is not durable');
 assert.deepEqual([...entries.entries()],before,'Active shell must remain untouched');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),false);
 assert.equal(sw.versions.get(oldShellVersion).size,shell.length);
});

test('runtime corruption without a persistent fence is evicted and fails closed',async()=>{
 const sw=worker({ignoreRecoveryOpen:true,corruptPutAt:1});
 await sw.lifecycle('install');
 const url=new URL('./app.mjs',scope).href;
 sw.versions.get(shellVersion).delete(url);
 assert.deepEqual(await sw.dispatch(sw.request('./app.mjs')),{networkError:true});
 assert.equal(sw.versions.get(shellVersion).has(url),false,
  'Unverified runtime bytes must not survive a failed fence write');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),false);
 assert.deepEqual(await sw.dispatch(sw.request('./app.mjs',{cache:'only-if-cached'})),
  {networkError:true});
 const restarted=worker({sharedVersions:sw.versions,failPrecache:true});
 assert.deepEqual(await restarted.dispatch(restarted.request('./index.html',{mode:'navigate'})),
  {networkError:true},'Incomplete active cache must not become trusted after restart');
 assert.equal(restarted.versions.get(oldShellVersion).size,shell.length);
});

test('silently ignored runtime write cannot claim success when its fence is transient',async()=>{
 const sw=worker({ignoreRecoveryOpen:true,skipPutAt:1});
 assert.deepEqual(await sw.dispatch(sw.request('./app.mjs')),{networkError:true});
 assert.equal(sw.putCalls,1);
 assert.equal(sw.versions.get(shellVersion).size,0);
 assert.equal(sw.versions.has(shellVersion+'-recovery'),false);
});

// An unfenced corrupt write is especially dangerous: a failed best-effort
// delete can leave a metadata-complete cache that is byte-inconsistent.
test('unfenced runtime corruption cannot be trusted by navigation or static reads',async()=>{
 const sw=worker({corruptPutAt:1,ignoreRecoveryOpen:true,failEntryDelete:true});
 await sw.lifecycle('install');await sw.lifecycle('activate');
 sw.versions.get(shellVersion).delete(new URL('./app.mjs',scope).href);
 assert.deepEqual(await sw.dispatch(sw.request('./app.mjs')),{networkError:true});
 assert.equal(sw.versions.get(shellVersion).size,shell.length,'Corrupt write remains when deletion fails');
 assert.equal(sw.versions.has(shellVersion+'-recovery'),false,'Durable fence is missing');
 assert.deepEqual(await sw.dispatch(sw.request('./style.css')),{networkError:true},'Unfenced worker must reject other cached assets');
 const calls=sw.networkCalls;
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate',cache:'only-if-cached'})),{networkError:true});
 assert.equal(sw.networkCalls,calls,'Cache-only navigation must never trigger a network recovery');
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate'})),{networkError:true},'Complete MIME metadata must not clear the failure');
});

test('unfenced corruption recovers only after a durable full-shell promotion',async()=>{
 const sw=worker({corruptPutAt:1,ignoreRecoveryOpen:true,failEntryDelete:true});
 await sw.lifecycle('install');await sw.lifecycle('activate');
 sw.versions.get(shellVersion).delete(new URL('./app.mjs',scope).href);
 assert.deepEqual(await sw.dispatch(sw.request('./app.mjs')),{networkError:true});
 sw.setIgnoreRecoveryOpen(false);sw.setEntryDeleteFailure(false);
 const page=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 assert.equal(page?.url,new URL('./index.html',scope).href);
 assert.equal(sw.versions.has(shellVersion+'-recovery'),false,'Recovery fence must be cleared after verified promotion');
 assert.equal(sw.versions.get(shellVersion).size,shell.length);
 const asset=await sw.dispatch(sw.request('./app.mjs'));
 assert.equal(asset?.url,new URL('./app.mjs',scope).href,'Repaired shell is available offline');
});

test('simultaneous repairs share one network request and survive offline restart',async()=>{
 const sw=worker();sw.pauseNextFetch('./app.mjs');
 const first=sw.dispatch(sw.request('./app.mjs'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.fetchPaused,true);
 const second=sw.dispatch(sw.request('./app.mjs'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.networkCalls,1,'Only one anonymous fetch per missing path');
 sw.releaseFetch();
 const [a,b]=await Promise.all([first,second]);
 assert.equal(a.ok,true);assert.equal(b.ok,true);
 assert.equal(a.bodyBytes,b.bodyBytes);
 assert.equal(sw.putCalls,1,'Only one durable cache write per path');
 const restarted=worker({sharedVersions:sw.versions,failPrecache:true,
  networkResponse:()=>{throw Error('Offline');}});
 const offline=await restarted.dispatch(restarted.request('./app.mjs',{cache:'only-if-cached'}));
 assert.equal(offline.bodyBytes,a.bodyBytes);
 assert.equal(restarted.networkCalls,0);
});

test('cache-only request cannot join an online repair',async()=>{
 const sw=worker();sw.pauseNextFetch('./app.mjs');
 const pending=sw.dispatch(sw.request('./app.mjs'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sw.fetchPaused,true);
 assert.deepEqual(await sw.dispatch(sw.request('./app.mjs',{cache:'only-if-cached'})),
  {networkError:true});
 assert.equal(sw.networkCalls,1);
 sw.releaseFetch();assert.equal((await pending).ok,true);
 assert.equal(sw.putCalls,1);
});

test('different shell paths repair independently during network stalls',async()=>{
 const sw=worker();sw.pauseNextFetch('./app.mjs');
 const pending=sw.dispatch(sw.request('./app.mjs'));
 await new Promise(resolve=>setImmediate(resolve));
 const css=await sw.dispatch(sw.request('./style.css'));
 assert.equal(css.headers.get('content-type'),'text/css');
 assert.equal(sw.networkCalls,2);
 assert.equal(sw.putCalls,1);
 sw.releaseFetch();assert.equal((await pending).ok,true);
 assert.equal(sw.putCalls,2);
});

test('failed coalesced network request clears its slot for a later retry',async()=>{
 let online=false;
 const sw=worker({networkResponse:req=>{
  if(!online)throw Error('Offline');
  return {ok:true,status:200,redirected:false,type:'basic',url:req.url,
   headers:{get:name=>name==='content-type'?'text/javascript':null},
   bodyBytes:'online-again',clone(){return this;},
   async arrayBuffer(){return new TextEncoder().encode(this.bodyBytes).buffer;}};
 }});
 sw.pauseNextFetch('./app.mjs');
 const first=sw.dispatch(sw.request('./app.mjs'));
 await new Promise(resolve=>setImmediate(resolve));
 const second=sw.dispatch(sw.request('./app.mjs'));
 await new Promise(resolve=>setImmediate(resolve));
 sw.releaseFetch();
 const failed=await Promise.allSettled([first,second]);
 assert.equal(failed.filter(x=>x.status==='rejected').length,2);
 assert.equal(sw.networkCalls,1);assert.equal(sw.putCalls,0);
 online=true;
 const repaired=await sw.dispatch(sw.request('./app.mjs'));
 assert.equal(repaired.bodyBytes,'online-again');
 assert.equal(sw.networkCalls,2);assert.equal(sw.putCalls,1);
});

test('offline version switch isolates new bytes and retains previous release',async()=>{
 const old=worker();await old.lifecycle('install');await old.lifecycle('activate');
 const nextVersion='klarpunkt-shell-v'+(Number(shellVersion.split('-v').at(-1))+1);
 const nextSource=source.replace("const VERSION='"+shellVersion+"';",
  "const VERSION='"+nextVersion+"';");
 assert.notEqual(nextSource,source);
 const next=worker({sharedVersions:old.versions,workerSource:nextSource,version:nextVersion});
 await next.lifecycle('install');await next.lifecycle('activate');
 const previous=await old.dispatch(old.request('./app.mjs',{cache:'only-if-cached'}));
 const current=await next.dispatch(next.request('./app.mjs',{cache:'only-if-cached'}));
 assert.equal(previous.bodyBytes.includes(shellVersion),true);
 assert.equal(current.bodyBytes.includes(nextVersion),true);
 assert.notEqual(previous.bodyBytes,current.bodyBytes);
 assert.equal(old.networkCalls,0);assert.equal(next.networkCalls,0);
 assert.equal(next.versions.get(shellVersion).size,shell.length);
 assert.equal(next.versions.has(oldShellVersion),false);
});

test('failed next-version installation preserves old offline cache',async()=>{
 const old=worker();await old.lifecycle('install');
 const nextVersion='klarpunkt-shell-v'+(Number(shellVersion.split('-v').at(-1))+1);
 const nextSource=source.replace("const VERSION='"+shellVersion+"';",
  "const VERSION='"+nextVersion+"';");
 const next=worker({sharedVersions:old.versions,workerSource:nextSource,
  version:nextVersion,failPrecache:true});
 await assert.rejects(next.lifecycle('install'),/Precache failed/);
 assert.equal(next.waiting,0);
 const prior=await old.dispatch(old.request('./app.mjs',{cache:'only-if-cached'}));
 assert.equal(prior.bodyBytes.includes(shellVersion),true);
 assert.equal(old.networkCalls,0);
 assert.equal(next.versions.get(shellVersion).size,shell.length);
});
