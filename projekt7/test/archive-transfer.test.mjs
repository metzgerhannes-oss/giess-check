import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {ARCHIVE_KEY,addSnapshot,readArchive} from '../archive.mjs';
import {serializeArchiveBackup,parseArchiveBackup,importArchiveBackup,MAX_ARCHIVE_FILE_BYTES} from '../archive-transfer.mjs';
import {PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';
function store(){
 const m=new Map();
 return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),raw:m};
}
test('portable archive round trip and BOM with active data untouched',()=>{
 const original=store();original.setItem(PRIMARY_KEY,'active');original.setItem(BACKUP_KEY,'backup');
 addSnapshot(original,blankProject(),1000);
 const file=serializeArchiveBackup(readArchive(original));
 const parsed=parseArchiveBackup('\uFEFF'+file);
 const target=store();target.setItem(PRIMARY_KEY,'different active');target.setItem(BACKUP_KEY,'different backup');
 assert.equal(importArchiveBackup(target,parsed,null),1);
 assert.equal(readArchive(target).items[0].project.title,'Meine Entscheidung');
 assert.equal(target.getItem(PRIMARY_KEY),'different active');
 assert.equal(target.getItem(BACKUP_KEY),'different backup');
});
test('empty archive is valid and serializable',()=>{
 const s=store();const file=serializeArchiveBackup(readArchive(s));
 assert.deepEqual(parseArchiveBackup(file).items,[]);
});
test('rejects wrong format, duplicates, timestamps, excess items and malformed JSON',()=>{
 const s=store();addSnapshot(s,blankProject(),1000);
 const good=JSON.parse(serializeArchiveBackup(readArchive(s)));
 assert.throws(()=>parseArchiveBackup('{broken'),/JSON/);
 assert.throws(()=>parseArchiveBackup(JSON.stringify({...good,format:'unknown'})),/Archivformat/);
 assert.throws(()=>parseArchiveBackup(JSON.stringify({...good,version:2})),/Archivformat/);
 assert.throws(()=>parseArchiveBackup(JSON.stringify({...good,items:[good.items[0],good.items[0]]})),/Archivstand/);
 assert.throws(()=>parseArchiveBackup(JSON.stringify({...good,items:[{...good.items[0],createdAt:0}]})),/Archivstand/);
 assert.throws(()=>parseArchiveBackup(JSON.stringify({...good,items:Array(13).fill(good.items[0])})),/Anzahl/);
 assert.throws(()=>parseArchiveBackup('x'.repeat(MAX_ARCHIVE_FILE_BYTES+1)),/350 KB/);
});
test('conflicts, quota errors and corrupt storage preserve the previous archive',()=>{
 const s=store();addSnapshot(s,blankProject(),1000);
 const before=s.getItem(ARCHIVE_KEY);
 const parsed=parseArchiveBackup(serializeArchiveBackup(readArchive(s)));
 assert.throws(()=>importArchiveBackup(s,parsed,'stale'),{code:'ARCHIVE_CONFLICT'});
 assert.equal(s.getItem(ARCHIVE_KEY),before);
 const fail={getItem:k=>s.getItem(k),setItem:()=>{throw new Error('QuotaExceededError')}};
 assert.throws(()=>importArchiveBackup(fail,parsed,before),/QuotaExceededError/);
 assert.equal(s.getItem(ARCHIVE_KEY),before);
 s.setItem(ARCHIVE_KEY,'{damaged');
 assert.throws(()=>importArchiveBackup(s,parsed,undefined),/beschädigt/);
 assert.equal(s.getItem(ARCHIVE_KEY),'{damaged');
 assert.throws(()=>serializeArchiveBackup(readArchive(s)),/beschädigt/);
});
test('import validates payload even when called without parser',()=>{
 const s=store();
 assert.throws(()=>importArchiveBackup(s,{version:1,items:[{id:'s1',createdAt:1,project:{version:99}}]},null));
 assert.equal(s.getItem(ARCHIVE_KEY),null);
 assert.throws(()=>importArchiveBackup(null,{version:1,items:[]}),/nicht verfügbar/);
});
