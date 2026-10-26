import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {ARCHIVE_KEY,addSnapshot,readArchive,ARCHIVE_CAP} from '../archive.mjs';
import {PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';
import {serializeArchiveBackup,parseArchiveBackup,mergeArchiveBackup,mergeArchiveBackupAsync} from '../archive-transfer.mjs';
function store(){const data=new Map();let writes=0;return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>{writes++;data.set(k,String(v));},get writes(){return writes;},snapshot:()=>new Map(data)};}
const named=title=>({...blankProject(),title});
function portable(title,time){const s=store();addSnapshot(s,named(title),time);return parseArchiveBackup(serializeArchiveBackup(readArchive(s)));}
function deferred(){let resolve;const promise=new Promise(ok=>{resolve=ok;});return {promise,resolve};}
test('merge preserves existing and active data, sorts entries',()=>{
 const s=store();s.setItem(PRIMARY_KEY,'active');s.setItem(BACKUP_KEY,'backup');
 addSnapshot(s,named('Existing'),2000);
 assert.equal(mergeArchiveBackup(s,portable('New',3000),readArchive(s).raw),1);
 assert.deepEqual(readArchive(s).items.map(x=>x.project.title),['New','Existing']);
 assert.equal(s.getItem(PRIMARY_KEY),'active');assert.equal(s.getItem(BACKUP_KEY),'backup');
});
test('duplicate-only import does not write',()=>{
 const s=store();addSnapshot(s,named('Same'),1000);
 const imported=parseArchiveBackup(serializeArchiveBackup(readArchive(s)));
 const before=s.snapshot(),writes=s.writes;
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),0);
 assert.equal(s.writes,writes);assert.deepEqual(s.snapshot(),before);
});
test('same ID with different contents keeps both',()=>{
 const s=store();addSnapshot(s,named('Original'),1000);
 const imported=parseArchiveBackup(serializeArchiveBackup(readArchive(s)));
 imported.items[0].project.title='Imported';
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),1);
 const items=readArchive(s).items;
 assert.equal(new Set(items.map(x=>x.id)).size,2);
 assert.deepEqual(items.map(x=>x.project.title).sort(),['Imported','Original']);
});
test('maximum-length ID collision remains valid and distinct',()=>{
 const s=store();addSnapshot(s,named('Original'),1000);
 const existing=readArchive(s).items[0];existing.id='s'+'a'.repeat(39);
 s.setItem(ARCHIVE_KEY,JSON.stringify({version:1,items:[existing]}));
 const imported={version:1,items:[{...existing,project:named('Imported')}]};
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),1);
 const ids=readArchive(s).items.map(x=>x.id);
 assert.equal(new Set(ids).size,2);assert.ok(ids.every(x=>x.length<=40));
});
test('full archive, stale revision, quota and corruption never discard existing data',()=>{
 const s=store();for(let i=0;i<ARCHIVE_CAP;i++)addSnapshot(s,named('Entry '+i),2000+i);
 const before=s.snapshot();
 assert.throws(()=>mergeArchiveBackup(s,portable('New',9000),readArchive(s).raw),/12 Archivstände/);
 assert.throws(()=>mergeArchiveBackup(s,portable('New',9000),'stale'),{code:'ARCHIVE_CONFLICT'});
 assert.deepEqual(s.snapshot(),before);
 const other=store();addSnapshot(other,named('Old'),1000);
 const blocked={getItem:k=>other.getItem(k),setItem:()=>{throw Error('QuotaExceededError');}};
 const original=other.snapshot();
 assert.throws(()=>mergeArchiveBackup(blocked,portable('New',9000),readArchive(other).raw),/QuotaExceededError/);
 assert.deepEqual(other.snapshot(),original);
 other.setItem(ARCHIVE_KEY,'{corrupt');
 assert.throws(()=>mergeArchiveBackup(other,portable('New',9000)),/beschädigt/);
});
test('approval is awaited, cancellation and no-op do not write',async()=>{
 const s=store();addSnapshot(s,named('Existing'),2000);
 const baseline=readArchive(s).raw,before=s.snapshot(),gate=deferred();
 const file=JSON.stringify({...portable('New',3000),format:'klarpunkt-archive'});
 const pending=mergeArchiveBackupAsync(s,()=>file,baseline,()=>gate.promise);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(s.snapshot(),before);
 gate.resolve(false);assert.equal(await pending,null);assert.deepEqual(s.snapshot(),before);
 const duplicate=serializeArchiveBackup(readArchive(s));let approvals=0;
 assert.equal(await mergeArchiveBackupAsync(s,()=>duplicate,baseline,()=>{approvals++;return true;}),0);
 assert.equal(approvals,0);
});
test('tab updates during file reading or approval reject without writes',async()=>{
 const s=store();addSnapshot(s,named('Existing'),2000);
 const baseline=readArchive(s).raw,file=JSON.stringify({...portable('New',3000),format:'klarpunkt-archive'});
 const readGate=deferred();let approvals=0;
 const first=mergeArchiveBackupAsync(s,()=>readGate.promise,baseline,()=>{approvals++;return true;});
 addSnapshot(s,named('Concurrent'),4000);const before=s.snapshot();readGate.resolve(file);
 await assert.rejects(first,{code:'ARCHIVE_CONFLICT'});assert.equal(approvals,0);assert.deepEqual(s.snapshot(),before);
 const gate=deferred(),fresh=readArchive(s).raw;
 const second=mergeArchiveBackupAsync(s,()=>file,fresh,()=>gate.promise);
 await new Promise(resolve=>setImmediate(resolve));
 addSnapshot(s,named('Later'),5000);const after=s.snapshot();gate.resolve(true);
 await assert.rejects(second,{code:'ARCHIVE_CONFLICT'});assert.deepEqual(s.snapshot(),after);
});
test('invalid imported structure is rejected before writing',()=>{
 const s=store(),before=s.snapshot();
 assert.throws(()=>mergeArchiveBackup(s,{version:1,items:[{id:'bad',createdAt:1,project:named('Bad')}]},null),/Archivstand/);
 assert.deepEqual(s.snapshot(),before);
});

test('replaying a conflicting import is a byte-for-byte no-op',()=>{
 const s=store();s.setItem(PRIMARY_KEY,'active');s.setItem(BACKUP_KEY,'backup');
 addSnapshot(s,named('Original'),1000);
 const imported=parseArchiveBackup(serializeArchiveBackup(readArchive(s)));
 imported.items[0].project.title='Imported';
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),1);
 const before=s.snapshot(),writes=s.writes;
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),0);
 assert.equal(s.writes,writes);
 assert.deepEqual(s.snapshot(),before);
 assert.deepEqual(readArchive(s).items.map(x=>x.project.title).sort(),['Imported','Original']);
});
test('several conflicting versions can be replayed in either order',()=>{
 const s=store();addSnapshot(s,named('Original'),1000);
 const imported=parseArchiveBackup(serializeArchiveBackup(readArchive(s)));
 const versionB=structuredClone(imported),versionC=structuredClone(imported);
 versionB.items[0].project.title='Version B';
 versionC.items[0].project.title='Version C';
 assert.equal(mergeArchiveBackup(s,versionB,readArchive(s).raw),1);
 assert.equal(mergeArchiveBackup(s,versionC,readArchive(s).raw),1);
 const before=s.snapshot(),writes=s.writes;
 assert.equal(mergeArchiveBackup(s,versionC,readArchive(s).raw),0);
 assert.equal(mergeArchiveBackup(s,versionB,readArchive(s).raw),0);
 assert.equal(s.writes,writes);
 assert.deepEqual(s.snapshot(),before);
 assert.deepEqual(readArchive(s).items.map(x=>x.project.title).sort(),['Original','Version B','Version C']);
});
test('an occupied legacy suffix does not hide a different imported revision',()=>{
 const s=store();
 s.setItem(ARCHIVE_KEY,JSON.stringify({version:1,items:[
  {id:'sbase',createdAt:1000,project:named('Original')},
  {id:'sbase_1',createdAt:1001,project:named('Unrelated')}
 ]}));
 const imported={version:1,items:[{id:'sbase',createdAt:1000,project:named('Imported')}]};
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),1);
 assert.ok(readArchive(s).items.some(x=>x.id==='sbase_2'&&x.project.title==='Imported'));
 const before=s.snapshot(),writes=s.writes;
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),0);
 assert.equal(s.writes,writes);assert.deepEqual(s.snapshot(),before);
});
test('replaying a collision at capacity succeeds without writes; novel data is rejected',()=>{
 const s=store();
 for(let i=0;i<ARCHIVE_CAP-1;i++)addSnapshot(s,named('Entry '+i),1000+i);
 const imported=parseArchiveBackup(serializeArchiveBackup(readArchive(s)));
 imported.items[0].project.title='Imported';
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),1);
 assert.equal(readArchive(s).items.length,ARCHIVE_CAP);
 const before=s.snapshot(),writes=s.writes;
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),0);
 assert.equal(s.writes,writes);assert.deepEqual(s.snapshot(),before);
 const novel=structuredClone(imported);novel.items[0].project.title='Novel';
 assert.throws(()=>mergeArchiveBackup(s,novel,readArchive(s).raw),/12 Archivstände/);
 assert.deepEqual(s.snapshot(),before);
});
test('async replay of a resolved collision needs no second approval',async()=>{
 const s=store();addSnapshot(s,named('Original'),1000);
 const imported=parseArchiveBackup(serializeArchiveBackup(readArchive(s)));
 imported.items[0].project.title='Imported';
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),1);
 const before=s.snapshot(),writes=s.writes;let approvals=0;
 const file=JSON.stringify({...imported,format:'klarpunkt-archive'});
 assert.equal(await mergeArchiveBackupAsync(s,()=>file,readArchive(s).raw,()=>{
  approvals++;return true;
 }),0);
 assert.equal(approvals,0);assert.equal(s.writes,writes);assert.deepEqual(s.snapshot(),before);
});
test('maximum-length legacy collision remains replay-safe',()=>{
 const s=store(),id='s'+'a'.repeat(39);
 s.setItem(ARCHIVE_KEY,JSON.stringify({version:1,items:[{id,createdAt:1000,project:named('Original')}]}));
 const imported={version:1,items:[{id,createdAt:1000,project:named('Imported')}]};
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),1);
 const before=s.snapshot(),writes=s.writes;
 assert.equal(mergeArchiveBackup(s,imported,readArchive(s).raw),0);
 assert.equal(s.writes,writes);assert.deepEqual(s.snapshot(),before);
 assert.ok(readArchive(s).items.every(x=>x.id.length<=40));
});
