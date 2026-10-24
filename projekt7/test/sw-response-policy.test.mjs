import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const scope='https://example.test/giess-check/projekt7/';
function harness(networkHeaders={}){
 const handlers=new Map();
 const entries=new Map();
 let writes=0,fetches=0;
 const self={registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)};
 const caches={open:async()=>({
  match:async request=>entries.get(typeof request==='string'?new URL(request,scope).href:request.url),
  put:async(request,response)=>{writes++;entries.set(request.url,response);}
 })};
 const response=(path,headers={})=>({
  ok:true,status:200,redirected:false,type:'basic',url:new URL(path,scope).href,
  headers:{get:name=>Object.hasOwn(headers,name)?headers[name]:null},
  clone(){return this;}
 });
 const fetch=async request=>{
  fetches++;
  return response(request.url,{'content-type':'text/javascript',...networkHeaders});
 };
 const sandbox={self,caches,fetch,URL,Set,Response:{error:()=>({networkError:true})}};
 runInNewContext(source+'\n;globalThis.__trusted=trustedShellAsset;',sandbox);
 const dispatch=request=>{
  let reply;
  handlers.get('fetch')({request,respondWith:promise=>{reply=promise;}});
  return reply;
 };
 const request=(path,headerNames=[])=>({
  url:new URL(path,scope).href,method:'GET',mode:'cors',
  headers:{has:name=>headerNames.includes(name)}
 });
 return {trusted:sandbox.__trusted,response,dispatch,request,entries,
  get writes(){return writes;},get fetches(){return fetches;}};
}
test('normal immutable public shell responses remain cacheable',()=>{
 const h=harness();
 assert.equal(h.trusted(h.response('./app.mjs',{
  'content-type':'text/javascript; charset=utf-8',
  'cache-control':'public, max-age=600',
  'vary':'Accept-Encoding',
  'content-length':'120'
 }), './app.mjs'),true);
});
for(const [label,headers] of [
 ['no-store',{'cache-control':'private, NO-STORE, max-age=0'}],
 ['wildcard vary',{'vary':'Accept-Encoding, *'}],
 ['partial content',{'content-range':'bytes 0-100/200'}],
 ['download disposition',{'content-disposition':'attachment; filename="app.mjs"'}],
 ['empty asset',{'content-length':'0'}]
]){
 test('precache trust gate rejects '+label,()=>{
  const h=harness();
  const asset=h.response('./app.mjs',{'content-type':'text/javascript',...headers});
  assert.equal(h.trusted(asset,'./app.mjs'),false);
 });
 test('runtime repair never persists '+label,async()=>{
  const h=harness(headers);
  const result=await h.dispatch(h.request('./app.mjs'));
  assert.equal(result.networkError,true);
  assert.equal(h.writes,0);
  assert.equal(h.entries.size,0);
 });
}
test('authorized and range requests bypass public shell cache',()=>{
 const h=harness();
 assert.equal(h.dispatch(h.request('./app.mjs',['authorization'])),undefined);
 assert.equal(h.dispatch(h.request('./icon-192.png',['range'])),undefined);
 assert.equal(h.fetches,0);
 assert.equal(h.writes,0);
});
test('ordinary public asset request still repairs and persists cache',async()=>{
 const h=harness();
 const result=await h.dispatch(h.request('./app.mjs'));
 assert.equal(result.ok,true);
 assert.equal(h.fetches,1);
 assert.equal(h.writes,1);
 assert.equal(h.entries.size,1);
});
