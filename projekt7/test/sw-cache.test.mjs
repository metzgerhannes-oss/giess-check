import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const scope='https://example.test/giess-check/projekt7/';
const shell=['./','./index.html','./style.css','./app.mjs','./core.mjs','./storage.mjs','./history.mjs','./unsaved.mjs','./archive.mjs','./archive-transfer.mjs','./backup.mjs','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'];
const mime=path=>path==='./'||path.endsWith('.html')?'text/html':
 path.endsWith('.css')?'text/css':path.endsWith('.mjs')?'text/javascript':
 path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/manifest+json';
const trusted=(path,extra={})=>({
 ok:true,status:200,redirected:false,type:'basic',url:new URL(path,scope).href,
 headers:{get:name=>name==='content-type'?mime(path):null},
 cached:true,...extra
});
function createWorker(){
 const handlers=new Map(),entries=new Map();
 let networkCalls=0;
 const cache={
  match:async request=>entries.get(typeof request==='string'?new URL(request,scope).href:request.url),
  put:async(request,response)=>{entries.set(typeof request==='string'?new URL(request,scope).href:request.url,response);},
  addAll:async files=>{for(const file of files)entries.set(typeof file==='string'?new URL(file,scope).href:file.url,{cached:true});}
 };
 const caches={open:async()=>cache,keys:async()=>[],delete:async()=>true};
 const self={location:{origin:new URL(scope).origin},registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn),skipWaiting:async()=>{},clients:{claim:async()=>{}}};
 const fetch=async()=>{networkCalls++;return {ok:true,clone(){return this;}};};
 runInNewContext(source,{self,caches,fetch,URL,Request,Set,Response:{error:()=>({networkError:true})}});
 const request=(url,{method='GET',mode='cors'}={})=>({url,method,mode});
 const dispatch=req=>{
  let response;
  handlers.get('fetch')({request:req,respondWith:p=>{response=p;}});
  return response;
 };
 return {dispatch,request,entries,get networkCalls(){return networkCalls;}};
}
test('known cached static asset is available offline without network',async()=>{
 const sw=createWorker(),url=scope+'app.mjs',cached=trusted('./app.mjs');
 sw.entries.set(url,cached);
 const response=sw.dispatch(sw.request(url));
 assert.equal(await response,cached);
 assert.equal(sw.networkCalls,0);
});
test('unknown same-origin endpoints are not intercepted or cached',()=>{
 const sw=createWorker();
 assert.equal(sw.dispatch(sw.request(scope+'private.json')),undefined);
 assert.equal(sw.dispatch(sw.request(scope+'user-data?token=1')),undefined);
 assert.equal(sw.entries.size,0);
});
test('query-string variants cannot grow the cache without bound',()=>{
 const sw=createWorker();
 assert.equal(sw.dispatch(sw.request(scope+'app.mjs?random=1')),undefined);
 assert.equal(sw.dispatch(sw.request(scope+'style.css?random=2')),undefined);
 assert.equal(sw.networkCalls,0);
});
test('external origins, other apps and writes are never intercepted',()=>{
 const sw=createWorker();
 assert.equal(sw.dispatch(sw.request('https://other.test/giess-check/projekt7/app.mjs')),undefined);
 assert.equal(sw.dispatch(sw.request('https://example.test/giess-check/other/app.mjs')),undefined);
 assert.equal(sw.dispatch(sw.request(scope+'app.mjs',{method:'POST'})),undefined);
});
test('version-pinned navigation uses cached index only inside app',async()=>{
 const sw=createWorker(),cached=trusted('./index.html');
 for(const path of shell)sw.entries.set(new URL(path,scope).href,trusted(path));
 sw.entries.set(scope+'index.html',cached);
 assert.equal(await sw.dispatch(sw.request(scope,{mode:'navigate'})),cached);
 assert.equal(await sw.dispatch(sw.request(scope+'index.html',{mode:'navigate'})),cached);
 assert.equal(sw.dispatch(sw.request(scope+'private',{mode:'navigate'})),undefined);
 assert.equal(sw.networkCalls,0);
});
