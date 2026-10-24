import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LIVE_ASSETS,validatePagesUrl,verifyPublishedAssets} from './live-verify.mjs';
test('accepts only scoped HTTPS GitHub Pages URLs',()=>{
 assert.equal(validatePagesUrl('https://example.github.io/repo/projekt7').pathname,'/repo/projekt7/');
 for(const u of ['http://example.github.io/repo/','https://evil.test/repo/','https://user:pass@example.github.io/','https://example.github.io/repo/?q=1'])assert.throws(()=>validatePagesUrl(u));
});
test('live verifier rejects stale and redirected assets',async()=>{
 const root=await mkdtemp(join(tmpdir(),'projekt7-live-')),data=new Map();
 try{
  for(const name of LIVE_ASSETS){const bytes=Buffer.from('asset:'+name);data.set(name,bytes);await writeFile(join(root,name),bytes);}
  const requests=[];
  const fake=async url=>{const u=new URL(url),name=u.pathname.split('/').pop();requests.push(url);return {ok:true,url:u.toString(),arrayBuffer:async()=>data.get(name)};};
  assert.equal((await verifyPublishedAssets('https://example.github.io/repo/projekt7/',root,fake)).length,LIVE_ASSETS.length);
  assert.ok(requests.every(u=>new URL(u).searchParams.has('_verify')));
  const missing=async url=>({...await fake(url),ok:false,status:404});
  await assert.rejects(()=>verifyPublishedAssets('https://example.github.io/repo/projekt7/',root,missing),/HTTP 404/);
  const stale=async url=>({...await fake(url),arrayBuffer:async()=>Buffer.from('stale')});
  await assert.rejects(()=>verifyPublishedAssets('https://example.github.io/repo/projekt7/',root,stale),/differs/);
  const redirect=async url=>({...await fake(url),url:'https://other.github.io/repo/'});
  await assert.rejects(()=>verifyPublishedAssets('https://example.github.io/repo/projekt7/',root,redirect),/redirect/);
 }finally{await rm(root,{recursive:true,force:true});}
});
