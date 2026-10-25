import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const scope='https://example.test/giess-check/projekt7/';
function worker({quota=false}={}){
 const handlers=new Map(),cacheEntries=new Map(),network=[],writes=[];
 const cache={
  match:async key=>cacheEntries.get(typeof key==='string'?new URL(key,scope).href:key.url),
  put:async(key,response)=>{
   writes.push(key);
   if(quota)throw new Error('QuotaExceededError');
   cacheEntries.set(key.url,response);
  }
 };
 const caches={open:async()=>cache,keys:async()=>[],delete:async()=>true};
 const self={registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)};
 const fetch=async (request,options)=>{
  network.push({request,options});
  return {
   ok:true,status:200,redirected:false,type:'basic',url:request.url,
   headers:{get:name=>name==='content-type'?'text/javascript':null},
   bodyBytes:'public:'+request.url,
   clone(){return this;},
   async arrayBuffer(){return new TextEncoder().encode(this.bodyBytes).buffer;}
  };
 };
 runInNewContext(source,{self,caches,fetch,URL,Request,Set,Response:{error:()=>({networkError:true})}});
 function dispatch(request){
  let response;
  handlers.get('fetch')({request,respondWith:p=>{response=p;}});
  return response;
 }
 return {dispatch,network,writes,cacheEntries};
}

test('runtime repair uses a canonical header-free request and cache key',async()=>{
 const h=worker();
 const incoming=new Request(scope+'app.mjs',{
  headers:{'x-private-session':'secret-value','accept-language':'de-DE','accept':'text/javascript'},
  referrer:'https://example.test/secret-referrer'
 });
 const result=await h.dispatch(incoming);
 assert.equal(result.ok,true);
 assert.equal(h.network.length,1);
 const {request,options}=h.network[0];
 assert.equal(request.url,scope+'app.mjs');
 assert.equal(request.credentials,'omit');
 assert.equal(options.credentials,'omit');
 assert.equal(request.cache,'reload');
 assert.equal(request.headers.has('x-private-session'),false);
 assert.equal(request.headers.has('accept-language'),false);
 assert.equal(request.headers.has('accept'),false);
 assert.equal(request.referrer,'');
 assert.equal(request.referrerPolicy,'no-referrer');
 assert.equal(request.mode,'same-origin');
 assert.equal(request.redirect,'error');
 assert.equal(h.writes.length,1);
 assert.equal(h.writes[0].url,scope+'app.mjs');
 assert.equal(h.writes[0].credentials,'omit');
 assert.equal(h.writes[0].referrer,'');
 assert.equal(h.writes[0].referrerPolicy,'no-referrer');
 assert.equal(h.writes[0].mode,'same-origin');
 assert.equal(h.writes[0].redirect,'error');
 assert.equal(h.writes[0].headers.has('x-private-session'),false);
 assert.equal(h.cacheEntries.size,1);
});

test('a subsequent cached asset does not forward any request headers',async()=>{
 const h=worker();
 await h.dispatch(new Request(scope+'app.mjs'));
 const cached=await h.dispatch(new Request(scope+'app.mjs',{
  headers:{'x-private-session':'different-secret'}
 }));
 assert.equal(cached.ok,true);
 assert.equal(h.network.length,1);
 assert.equal(h.writes.length,1);
});

test('credentialed and conditional requests bypass public shell interception',()=>{
 const h=worker();
 assert.equal(h.dispatch(new Request(scope+'app.mjs',{credentials:'include'})),undefined);
 assert.equal(h.dispatch(new Request(scope+'app.mjs',{headers:{authorization:'Bearer secret'}})),undefined);
 assert.equal(h.dispatch(new Request(scope+'app.mjs',{headers:{range:'bytes=0-5'}})),undefined);
 assert.equal(h.network.length,0);
 assert.equal(h.writes.length,0);
});

test('quota failure does not persist the response or retry with original headers',async()=>{
 const h=worker({quota:true});
 const response=await h.dispatch(new Request(scope+'app.mjs',{headers:{'x-private-session':'secret'}}));
 assert.equal(response.ok,true);
 assert.equal(h.network.length,1);
 assert.equal(h.network[0].request.headers.has('x-private-session'),false);
 assert.equal(h.writes.length,1);
 assert.equal(h.cacheEntries.size,0);
});

test('explicit cache-only misses never issue a reconstructed network request',async()=>{
 const h=worker();
 const request=new Request(scope+'app.mjs',{cache:'only-if-cached',mode:'same-origin'});
 const result=await h.dispatch(request);
 assert.equal(result.networkError,true);
 assert.equal(h.network.length,0);
 assert.equal(h.writes.length,0);
});

test('incoming cross-site referrer and tracking headers cannot influence canonical repairs',async()=>{
 const h=worker();
 const incoming=new Request(scope+'app.mjs',{
  headers:{'x-visitor-id':'sensitive','x-forwarded-for':'127.0.0.1'},
  referrer:'https://outside.test/private?token=sensitive',
  referrerPolicy:'unsafe-url'
 });
 const result=await h.dispatch(incoming);
 assert.equal(result.ok,true);
 const sent=h.network[0].request;
 assert.equal(sent.referrer,'');
 assert.equal(sent.referrerPolicy,'no-referrer');
 assert.equal(sent.redirect,'error');
 assert.equal(sent.mode,'same-origin');
 assert.equal(sent.headers.has('x-visitor-id'),false);
 assert.equal(sent.headers.has('x-forwarded-for'),false);
 assert.equal(h.writes[0].referrerPolicy,'no-referrer');
});
