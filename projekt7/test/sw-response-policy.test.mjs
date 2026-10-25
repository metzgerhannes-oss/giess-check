import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const scope='https://example.test/giess-check/projekt7/';
function harness(networkHeaders={}){
 const handlers=new Map();
 const entries=new Map();
 let writes=0,fetches=0,opens=[],lastFetchOptions=null;
 const self={registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)};
 const caches={keys:async()=>[],open:async name=>{opens.push(name);return {
  match:async request=>entries.get(typeof request==='string'?new URL(request,scope).href:request.url),
  put:async(request,response)=>{writes++;entries.set(request.url,response);}
 };}};
 const response=(path,headers={})=>({
  ok:true,status:200,redirected:false,type:'basic',url:new URL(path,scope).href,
  headers:{get:name=>Object.hasOwn(headers,name)?headers[name]:null},
  clone(){return this;}
 });
 const fetch=async (request,options)=>{
  fetches++;
  lastFetchOptions=options;
  return response(request.url,{'content-type':'text/javascript',...networkHeaders});
 };
 const sandbox={self,caches,fetch,URL,Request,Set,Response:{error:()=>({networkError:true})}};
 runInNewContext(source+'\n;globalThis.__trusted=trustedShellAsset;',sandbox);
 const dispatch=request=>{
  let reply;
  handlers.get('fetch')({request,respondWith:promise=>{reply=promise;}});
  return reply;
 };
 const request=(path,headerNames=[])=>({
  url:new URL(path,scope).href,method:'GET',mode:'cors',credentials:'same-origin',
  headers:{has:name=>headerNames.includes(name)}
 });
 return {trusted:sandbox.__trusted,response,dispatch,request,entries,opens,
  get writes(){return writes;},get fetches(){return fetches;},
  get lastFetchOptions(){return lastFetchOptions;}};
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
 ['empty asset',{'content-length':'0'}],
 ['private response',{'cache-control':'private, max-age=3600'}],
 ['revalidation required',{'cache-control':'no-cache'}],
 ['private field list',{'cache-control':'private="Set-Cookie"'}],
 ['cookie variant',{'vary':'Accept-Encoding, Cookie'}],
 ['authorization variant',{'vary':'Authorization'}],
 ['proxy authorization variant',{'vary':'Proxy-Authorization'}],
 ['origin variant',{'vary':'Origin'}],
 ['session-setting cookie',{'set-cookie':'sid=private; HttpOnly'}],
 ['legacy session-setting cookie',{'set-cookie2':'sid=private'}],
 ['non-byte content range',{'content-range':'items 0-4/10'}],
 ['unsatisfied byte range',{'content-range':'bytes */200'}]
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
 assert.equal(h.lastFetchOptions?.credentials,'omit','Runtime repair must be anonymous');
 assert.equal(h.writes,1);
 assert.equal(h.entries.size,1);
});
test('explicitly credentialed shell requests bypass the public cache',()=>{
 const h=harness();
 assert.equal(h.dispatch({...h.request('./app.mjs'),credentials:'include'}),undefined);
 assert.equal(h.dispatch({...h.request('./index.html'),mode:'navigate',credentials:'include'}),undefined);
 assert.equal(h.fetches,0);
 assert.equal(h.writes,0);
});

test('navigation with query parameters never substitutes the public cached shell',()=>{
 const h=harness();
 assert.equal(h.dispatch({...h.request('./?session=opaque'),mode:'navigate'}),undefined);
 assert.equal(h.dispatch({...h.request('./index.html?state=1'),mode:'navigate'}),undefined);
 assert.equal(h.fetches,0);
 assert.equal(h.writes,0);
});
test('requests explicitly requiring no storage or conditional validation bypass shell cache',()=>{
 const h=harness();
 for(const headers of [['cookie'],['if-none-match'],['if-modified-since'],['if-match'],['if-unmodified-since'],['if-range']]){
  assert.equal(h.dispatch(h.request('./app.mjs',headers)),undefined,headers.join(','));
 }
 assert.equal(h.dispatch({...h.request('./app.mjs'),cache:'no-store'}),undefined);
 assert.equal(h.fetches,0);
 assert.equal(h.writes,0);
});
test('cache entries marked private or varying by user are never reused',async()=>{
 const h=harness();
 const url=new URL('./app.mjs',scope).href;
 for(const headers of [{'cache-control':'private'},{vary:'Cookie'},{vary:'Authorization'}]){
  const poisoned=h.response('./app.mjs',{'content-type':'text/javascript',...headers});
  h.entries.set(url,poisoned);
  const result=await h.dispatch(h.request('./app.mjs'));
  assert.equal(result.ok,true);
  assert.notEqual(result,poisoned);
  assert.notEqual(h.entries.get(url),poisoned);
 }
 assert.equal(h.fetches,3);
 assert.equal(h.writes,3);
});
test('safe cache variation and public cache-control remain valid',()=>{
 const h=harness();
 assert.equal(h.trusted(h.response('./app.mjs',{
  'content-type':'text/javascript','cache-control':'public, max-age=3600',
  'vary':'Accept-Encoding, Accept-Language'
 }), './app.mjs'),true);
});


test('cache-only static reads never fetch or persist missing and untrusted entries',async()=>{
 const h=harness(),request={...h.request('./app.mjs'),cache:'only-if-cached'};
 assert.equal((await h.dispatch(request)).networkError,true);
 const key=new URL('./app.mjs',scope).href;
 h.entries.set(key,h.response('./app.mjs',{'content-type':'text/html'}));
 assert.equal((await h.dispatch(request)).networkError,true);
 assert.equal(h.fetches,0);
 assert.equal(h.writes,0);
 assert.equal(h.entries.get(key).headers.get('content-type'),'text/html');
 assert.equal(h.opens.length,2);
});

test('cache-only static hit uses validated offline bytes without network',async()=>{
 const h=harness(),request={...h.request('./app.mjs'),cache:'only-if-cached'};
 const trusted=h.response('./app.mjs',{'content-type':'text/javascript'});
 h.entries.set(new URL('./app.mjs',scope).href,trusted);
 assert.equal(await h.dispatch(request),trusted);
 assert.equal(h.fetches,0);
 assert.equal(h.writes,0);
});

test('cache-only navigation refuses incomplete shell without starting recovery',async()=>{
 const h=harness(),request={...h.request('./index.html'),mode:'navigate',cache:'only-if-cached'};
 assert.equal((await h.dispatch(request)).networkError,true);
 assert.equal(h.fetches,0);
 assert.equal(h.writes,0);
 assert.equal(h.opens.length,1,'No staging cache may be opened for a cache-only request');
 assert.ok(!h.opens.some(name=>name.endsWith('-recovery')));
});

for(const [label,vary] of [
 ['unknown session dimension','X-Session-Token'],
 ['custom authorization dimension','X-Auth, Accept-Encoding'],
 ['malformed empty dimension','Accept-Encoding,,Accept-Language'],
 ['unrecognized user agent dimension','User-Agent']
]){
 test('public shell trust rejects '+label,()=>{
  const h=harness();
  assert.equal(h.trusted(h.response('./app.mjs',{
   'content-type':'text/javascript','vary':vary
  }),'./app.mjs'),false);
 });
 test('runtime repair fails closed for '+label,async()=>{
  const h=harness({'vary':vary});
  const result=await h.dispatch(h.request('./app.mjs'));
  assert.equal(result.networkError,true);
  assert.equal(h.fetches,1);
  assert.equal(h.writes,0);
 });
}
test('known public negotiation dimensions remain allowed',()=>{
 const h=harness();
 for(const vary of ['Accept','Accept-Encoding','Accept-Language',
  'Accept-Encoding, Accept-Language']){
  assert.equal(h.trusted(h.response('./app.mjs',{
   'content-type':'text/javascript','vary':vary
  }),'./app.mjs'),true,vary);
 }
});
