import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {ARCHIVE_CAP,ARCHIVE_KEY,MAX_ARCHIVE_BYTES,readArchive,addSnapshot,removeSnapshot} from '../archive.mjs';
import {MAX_ARCHIVE_FILE_BYTES,serializeArchiveBackup,parseArchiveBackup,importArchiveBackup} from '../archive-transfer.mjs';
import {PRIMARY_KEY,BACKUP_KEY,saveProject,inspectStorage} from '../storage.mjs';

function store(){
 const map=new Map();
 return {
  getItem:key=>map.has(key)?map.get(key):null,
  setItem:(key,value)=>map.set(key,String(value)),
  dump:()=>new Map(map)
 };
}
const named=title=>({...blankProject(),title});

test('portable and local archive use the same UTF-8 limit',()=>{
 assert.equal(MAX_ARCHIVE_BYTES,350000);
 assert.equal(MAX_ARCHIVE_FILE_BYTES,MAX_ARCHIVE_BYTES);
});
test('invalid snapshot timestamps never mutate an existing archive',()=>{
 const s=store();addSnapshot(s,named('Safe'),1000);
 const before=s.dump(),expected=s.getItem(ARCHIVE_KEY);
 for(const now of [0,-1,Infinity,-Infinity,Number.MAX_SAFE_INTEGER+1,NaN,'invalid']){
  assert.throws(()=>addSnapshot(s,named('Bad'),now,expected),/Zeitstempel/);
  assert.deepEqual(s.dump(),before);
 }
});
test('largest safe integer timestamp remains readable and portable',()=>{
 const s=store();
 const item=addSnapshot(s,named('Safe'),Number.MAX_SAFE_INTEGER);
 assert.equal(item.createdAt,Number.MAX_SAFE_INTEGER);
 assert.equal(readArchive(s).state,'ok');
 assert.equal(parseArchiveBackup(serializeArchiveBackup(readArchive(s))).items[0].createdAt,Number.MAX_SAFE_INTEGER);
});
test('oversized UTF-8 archive is damaged even if JavaScript character count is small',()=>{
 const s=store();
 const raw=JSON.stringify({version:1,items:[],padding:'ü'.repeat(180000)});
 assert.ok(raw.length<MAX_ARCHIVE_BYTES);
 assert.ok(new TextEncoder().encode(raw).byteLength>MAX_ARCHIVE_BYTES);
 s.setItem(ARCHIVE_KEY,raw);
 const before=s.dump();
 assert.equal(readArchive(s).state,'damaged');
 assert.throws(()=>addSnapshot(s,named('Unsafe'),1001),/beschädigt/);
 assert.deepEqual(s.dump(),before);
});
test('twelve maximum-density Unicode snapshots roundtrip without data loss',()=>{
 const s=store(),p=blankProject();
 p.title='🌿'.repeat(60);
 p.options=Array.from({length:6},(_,i)=>({id:'o'+i,name:'🌿'.repeat(40)}));
 p.criteria=Array.from({length:9},(_,i)=>({
  id:'c'+i,name:'ü'.repeat(80),weight:5,uncertainty:3,
  ratings:Object.fromEntries(p.options.map(o=>[o.id,10]))
 }));
 for(let i=0;i<ARCHIVE_CAP;i++)addSnapshot(s,p,1000+i,s.getItem(ARCHIVE_KEY));
 const source=readArchive(s);
 assert.equal(source.state,'ok');assert.equal(source.items.length,ARCHIVE_CAP);
 assert.ok(new TextEncoder().encode(source.raw).byteLength<=MAX_ARCHIVE_BYTES);
 const target=store();
 const portable=parseArchiveBackup(serializeArchiveBackup(source));
 assert.equal(importArchiveBackup(target,portable,null),ARCHIVE_CAP);
 assert.deepEqual(readArchive(target).items,source.items);
});
test('quota failure during archive append and removal preserves original bytes',()=>{
 const s=store();const item=addSnapshot(s,named('Existing'),1000);
 const before=s.dump();
 const blocked={
  getItem:key=>s.getItem(key),
  setItem:()=>{throw new Error('QuotaExceededError');}
 };
 assert.throws(()=>addSnapshot(blocked,named('New'),1001,s.getItem(ARCHIVE_KEY)),/QuotaExceededError/);
 assert.throws(()=>removeSnapshot(blocked,item.id,s.getItem(ARCHIVE_KEY)),/QuotaExceededError/);
 assert.deepEqual(s.dump(),before);
});
test('stale snapshot append and removal reject before touching storage',()=>{
 const s=store();const item=addSnapshot(s,named('Existing'),1000);
 const before=s.dump();
 assert.throws(()=>addSnapshot(s,named('Stale'),1001,'stale'),{code:'ARCHIVE_CONFLICT'});
 assert.throws(()=>removeSnapshot(s,item.id,'stale'),{code:'ARCHIVE_CONFLICT'});
 assert.deepEqual(s.dump(),before);
});
test('throwing optional-backup warning callback cannot invalidate committed primary',()=>{
 const s=store();saveProject(s,named('Original'));
 let callbacks=0;
 const blocked={
  getItem:key=>s.getItem(key),
  setItem:(key,value)=>{
   if(key===BACKUP_KEY)throw new Error('QuotaExceededError');
   s.setItem(key,value);
  }
 };
 const saved=saveProject(blocked,named('Committed'),false,s.getItem(PRIMARY_KEY),()=>{
  callbacks++;throw new Error('Broken UI callback');
 });
 assert.equal(saved.title,'Committed');
 assert.equal(callbacks,1);
 assert.equal(inspectStorage(s).project.title,'Committed');
 assert.equal(JSON.parse(s.getItem(BACKUP_KEY)).title,'Original');
});
