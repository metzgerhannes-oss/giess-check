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
