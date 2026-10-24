import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const scope='https://example.test/giess-check/projekt7/';
const shell=['./','./index.html','./style.css','./app.mjs','./core.mjs','./storage.mjs','./history.mjs','./unsaved.mjs','./archive.mjs','./archive-transfer.mjs','./backup.mjs','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'];
function worker({missing=null,failPrecache=false,networkResponse=null,failPut=false,badPrecache=null}={}){
 const handlers=new Map(),versions=new Map(),deleted=[];
 const current='klarpunkt-shell-v17',old='klarpunkt-shell-v16';
 const oldEntries=new Map(shell.map(path=>[new URL(path,scope).href,{old:true}]));
 versions.set(old,oldEntries);versions.set('unrelated-app',new Map());
 let waiting=0,claimed=0,networkCalls=0,putCalls=0,addAllCalls=0;
 let precacheShouldFail=failPrecache;
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
        ok:fault?.ok??true,redirected:fault?.redirected??false,
        type:fault?.type??'basic',url:fault?.url??keyOf(path),
        headers:{get:()=>fault?.mime??mime}
       });
      }
     }
     if(precacheShouldFail)throw Error('Precache failed');
     entries.clear();
     for(const [key,value] of staged)entries.set(key,value);
    },
    put:async(req,response)=>{
     putCalls++;
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
   ok:true,redirected:false,type:'basic',url:req.url,
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
 assert.deepEqual(sw.deleted,['klarpunkt-shell-v16']);
 assert.equal(sw.versions.has('unrelated-app'),true);
 assert.equal(sw.versions.get('klarpunkt-shell-v17').size,shell.length);
});
test('failed precache never skips waiting or removes a previous offline version',async()=>{
 const sw=worker({failPrecache:true});
 await assert.rejects(sw.lifecycle('install'),/Precache failed/);
 assert.equal(sw.waiting,0);
 assert.equal(sw.versions.has('klarpunkt-shell-v16'),true);
 assert.deepEqual(sw.deleted,[]);
});
test('partial precache fails closed rather than installing a broken shell',async()=>{
 const sw=worker({missing:'./core.mjs'});
 await assert.rejects(sw.lifecycle('install'),/Incomplete offline shell/);
 assert.equal(sw.waiting,0);
 assert.equal(sw.versions.has('klarpunkt-shell-v16'),true);
});
test('activation with evicted current asset preserves older complete shell',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 sw.versions.get('klarpunkt-shell-v17').delete(new URL('./app.mjs',scope).href);
 await assert.rejects(sw.lifecycle('activate'),/Incomplete offline shell/);
 assert.equal(sw.claimed,0);
 assert.deepEqual(sw.deleted,[]);
 assert.equal(sw.versions.get('klarpunkt-shell-v16').size,shell.length);
});
test('precache rejects wrong MIME, redirects, foreign URLs and opaque responses without evicting old shell',async()=>{
 const faults=[
  {path:'./app.mjs',mime:'text/html'},
  {path:'./style.css',redirected:true},
  {path:'./core.mjs',url:'https://login.example.test/'},
  {path:'./index.html',type:'opaque'},
  {path:'./icon-192.png',ok:false}
 ];
 for(const badPrecache of faults){
  const sw=worker({badPrecache});
  await assert.rejects(sw.lifecycle('install'),/Incomplete offline shell/);
  assert.equal(sw.waiting,0);
  assert.equal(sw.versions.has('klarpunkt-shell-v16'),true);
  assert.deepEqual(sw.deleted,[]);
 }
});
test('activation refuses a poisoned cached shell and keeps previous offline version',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 const url=new URL('./app.mjs',scope).href;
 sw.versions.get('klarpunkt-shell-v17').get(url).headers.get=()=> 'text/html';
 await assert.rejects(sw.lifecycle('activate'),/Incomplete offline shell/);
 assert.equal(sw.claimed,0);
 assert.deepEqual(sw.deleted,[]);
 assert.equal(sw.versions.get('klarpunkt-shell-v16').size,shell.length);
});
test('redirected asset responses are delivered but never persisted',async()=>{
 const sw=worker({networkResponse:req=>({
  ok:true,redirected:true,type:'basic',url:'https://login.example.test/',clone(){return this;}
 })});
 const response=await sw.dispatch(sw.request('./app.mjs'));
 assert.equal(response.redirected,true);
 assert.equal(sw.putCalls,0);
 assert.equal(sw.versions.get('klarpunkt-shell-v17').size,0);
});
test('opaque, mismatched-URL and failed network responses are never cached',async()=>{
 for(const response of [
  {ok:true,redirected:false,type:'opaque',url:scope+'app.mjs'},
  {ok:true,redirected:false,type:'basic',url:scope+'other.mjs'},
  {ok:false,redirected:false,type:'basic',url:scope+'app.mjs'}
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
 assert.equal(sw.versions.get('klarpunkt-shell-v17').has(req.url),true);
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
 assert.equal(sw.versions.get('klarpunkt-shell-v17').size,0);
});


test('runtime repair rejects a login HTML response served as JavaScript',async()=>{
 const sw=worker({networkResponse:req=>({
  ok:true,redirected:false,type:'basic',url:req.url,
  headers:{get:()=> 'text/html'},clone(){return this;}
 })});
 const response=await sw.dispatch(sw.request('./app.mjs'));
 assert.equal(response.ok,true,'Online response may still reach the browser');
 assert.equal(sw.putCalls,0,'Wrong MIME must never enter persistent cache');
});
test('runtime repair rejects HTML disguised as CSS, SVG, PNG or manifest',async()=>{
 for(const path of ['./style.css','./icon.svg','./icon-192.png','./manifest.webmanifest']){
  const sw=worker({networkResponse:req=>({
   ok:true,redirected:false,type:'basic',url:req.url,
   headers:{get:()=> 'text/html'},clone(){return this;}
  })});
  await sw.dispatch(sw.request(path));
  assert.equal(sw.putCalls,0,path);
 }
});
test('poisoned cached module is bypassed and replaced by trusted network response',async()=>{
 const sw=worker(),req=sw.request('./app.mjs');
 await sw.lifecycle('install');
 const poisoned={ok:true,redirected:false,type:'basic',url:req.url,headers:{get:()=> 'text/html'}};
 sw.versions.get('klarpunkt-shell-v17').set(req.url,poisoned);
 const response=await sw.dispatch(req);
 assert.notEqual(response,poisoned);
 assert.equal(sw.networkCalls,1);
 assert.equal(sw.putCalls,1);
 assert.equal(sw.versions.get('klarpunkt-shell-v17').get(req.url),response);
});
test('poisoned cached module is not served when the network fails',async()=>{
 const sw=worker({networkResponse:()=>{throw Error('Offline');}}),req=sw.request('./app.mjs');
 await sw.lifecycle('install');
 sw.versions.get('klarpunkt-shell-v17').set(req.url,{
  ok:true,redirected:false,type:'basic',url:req.url,headers:{get:()=> 'text/html'}
 });
 await assert.rejects(sw.dispatch(req),/Offline/);
 assert.equal(sw.putCalls,0);
});
test('poisoned navigation HTML fails closed rather than executing cached content',async()=>{
 const sw=worker(),req=sw.request('./index.html',{mode:'navigate'});
 await sw.lifecycle('install');
 sw.versions.get('klarpunkt-shell-v17').set(req.url,{
  ok:true,redirected:false,type:'basic',url:req.url,headers:{get:()=> 'text/javascript'}
 });
 assert.deepEqual(await sw.dispatch(req),{networkError:true});
 assert.equal(sw.networkCalls,0);
});
test('empty shell is recovered as a complete validated batch before navigation',async()=>{
 const sw=worker();
 const page=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(sw.versions.get('klarpunkt-shell-v17').size,shell.length);
 assert.equal(sw.addAllCalls,1);
 assert.equal(sw.networkCalls,0,'Navigation must not mix cached and network assets');
 const offline=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 assert.equal(offline,page);
 assert.equal(sw.addAllCalls,1,'Healthy offline shell must not redownload');
});
test('partially evicted shell is fully restored before cached HTML is served',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 sw.versions.get('klarpunkt-shell-v17').delete(new URL('./core.mjs',scope).href);
 const page=await sw.dispatch(sw.request('./index.html',{mode:'navigate'}));
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(sw.addAllCalls,2);
 assert.equal(sw.versions.get('klarpunkt-shell-v17').size,shell.length);
});
test('failed offline recovery fails closed and retains the previous shell',async()=>{
 const sw=worker({failPrecache:true});
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate'})),{networkError:true});
 assert.equal(sw.versions.get('klarpunkt-shell-v16').size,shell.length);
 assert.equal(sw.waiting,0);
 assert.deepEqual(sw.deleted,[]);
});
test('invalid MIME during recovery never exposes partial HTML',async()=>{
 const sw=worker({badPrecache:{path:'./app.mjs',mime:'text/html'}});
 assert.deepEqual(await sw.dispatch(sw.request('./index.html',{mode:'navigate'})),{networkError:true});
 assert.equal(sw.versions.get('klarpunkt-shell-v16').size,shell.length);
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
 const entries=sw.versions.get('klarpunkt-shell-v17');
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
 assert.equal(sw.versions.get('klarpunkt-shell-v17').size,0,'Atomic failure cannot leave partial shell');
 assert.equal(sw.versions.get('unrelated-app').size,0);
 sw.setPrecacheFailure(false);
 const page=await sw.dispatch(req);
 assert.equal(page.headers.get('content-type'),'text/html');
 assert.equal(sw.versions.get('klarpunkt-shell-v17').size,shell.length);
 assert.equal(sw.versions.get('klarpunkt-shell-v16').size,shell.length);
});
