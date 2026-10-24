import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const scope='https://example.test/giess-check/projekt7/';
const shell=['./','./index.html','./style.css','./app.mjs','./core.mjs','./storage.mjs','./history.mjs','./unsaved.mjs','./archive.mjs','./archive-transfer.mjs','./backup.mjs','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'];
function worker({missing=null,failPrecache=false,networkResponse=null,failPut=false}={}){
 const handlers=new Map(),versions=new Map(),deleted=[];
 const current='klarpunkt-shell-v14',old='klarpunkt-shell-v13';
 const oldEntries=new Map(shell.map(path=>[new URL(path,scope).href,{old:true}]));
 versions.set(old,oldEntries);versions.set('unrelated-app',new Map());
 let waiting=0,claimed=0,networkCalls=0,putCalls=0;
 const keyOf=req=>new URL(typeof req==='string'?req:req.url,scope).href;
 const caches={
  open:async name=>{
   if(!versions.has(name))versions.set(name,new Map());
   const entries=versions.get(name);
   return {
    match:async req=>entries.get(keyOf(req)),
    addAll:async files=>{
     for(const path of files){
      if(path!==missing)entries.set(keyOf(path),{cached:true});
     }
     if(failPrecache)throw Error('Precache failed');
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
  return networkResponse?networkResponse(req):{
   ok:true,redirected:false,type:'basic',url:req.url,clone(){return this;}
  };
 };
 runInNewContext(source,{self,caches,fetch,URL,Set});
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
  get waiting(){return waiting;},get claimed(){return claimed;},
  get networkCalls(){return networkCalls;},get putCalls(){return putCalls;}
 };
}
test('complete precache permits activation and removes only older app versions',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 assert.equal(sw.waiting,1);
 await sw.lifecycle('activate');
 assert.equal(sw.claimed,1);
 assert.deepEqual(sw.deleted,['klarpunkt-shell-v13']);
 assert.equal(sw.versions.has('unrelated-app'),true);
 assert.equal(sw.versions.get('klarpunkt-shell-v14').size,shell.length);
});
test('failed precache never skips waiting or removes a previous offline version',async()=>{
 const sw=worker({failPrecache:true});
 await assert.rejects(sw.lifecycle('install'),/Precache failed/);
 assert.equal(sw.waiting,0);
 assert.equal(sw.versions.has('klarpunkt-shell-v13'),true);
 assert.deepEqual(sw.deleted,[]);
});
test('partial precache fails closed rather than installing a broken shell',async()=>{
 const sw=worker({missing:'./core.mjs'});
 await assert.rejects(sw.lifecycle('install'),/Incomplete offline shell/);
 assert.equal(sw.waiting,0);
 assert.equal(sw.versions.has('klarpunkt-shell-v13'),true);
});
test('activation with evicted current asset preserves older complete shell',async()=>{
 const sw=worker();
 await sw.lifecycle('install');
 sw.versions.get('klarpunkt-shell-v14').delete(new URL('./app.mjs',scope).href);
 await assert.rejects(sw.lifecycle('activate'),/Incomplete offline shell/);
 assert.equal(sw.claimed,0);
 assert.deepEqual(sw.deleted,[]);
 assert.equal(sw.versions.get('klarpunkt-shell-v13').size,shell.length);
});
test('redirected asset responses are delivered but never persisted',async()=>{
 const sw=worker({networkResponse:req=>({
  ok:true,redirected:true,type:'basic',url:'https://login.example.test/',clone(){return this;}
 })});
 const response=await sw.dispatch(sw.request('./app.mjs'));
 assert.equal(response.redirected,true);
 assert.equal(sw.putCalls,0);
 assert.equal(sw.versions.get('klarpunkt-shell-v14').size,0);
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
 assert.equal(sw.versions.get('klarpunkt-shell-v14').has(req.url),true);
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
 assert.equal(sw.versions.get('klarpunkt-shell-v14').size,0);
});
