import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {ARCHIVE_KEY,readArchive,addSnapshot,removeSnapshot,verifyArchiveWrite} from '../archive.mjs';
import {parseArchiveBackup,serializeArchiveBackup,importArchiveBackup,mergeArchiveBackup} from '../archive-transfer.mjs';

const project=()=>blankProject();
function store(){
 const data=new Map();let writes=0;
 return {getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>{writes++;data.set(key,String(value));},
  get writes(){return writes;},snapshot:()=>new Map(data)};
}
const entry=id=>({id,createdAt:1000,project:project()});

test('local archive with an array ID is damaged and never overwritten',()=>{
 const s=store(),raw=JSON.stringify({version:1,items:[entry(['sabc'])]});
 s.setItem(ARCHIVE_KEY,raw);const before=s.snapshot(),writes=s.writes;
 assert.equal(readArchive(s).state,'damaged');
 assert.throws(()=>addSnapshot(s,project(),2000),/beschädigt/);
 assert.throws(()=>removeSnapshot(s,'sabc'),/beschädigt/);
 assert.equal(s.writes,writes);assert.deepEqual(s.snapshot(),before);
});
test('two array IDs cannot bypass the uniqueness check',()=>{
 const s=store();s.setItem(ARCHIVE_KEY,JSON.stringify({
  version:1,items:[entry(['sabc']),entry(['sabc'])]
 }));
 assert.equal(readArchive(s).state,'damaged');
});
test('portable JSON parser rejects an array ID before import',()=>{
 const text=JSON.stringify({format:'klarpunkt-archive',version:1,items:[entry(['sabc'])]});
 assert.throws(()=>parseArchiveBackup(text),/Archivstand/);
});
test('sparse archive import and merge reject without writing',()=>{
 const s=store(),before=s.snapshot(),items=new Array(1),parsed={version:1,items};
 assert.throws(()=>importArchiveBackup(s,parsed,null),/Archivstand/);
 assert.throws(()=>mergeArchiveBackup(s,parsed,null),/Archivstand/);
 assert.deepEqual(s.snapshot(),before);assert.equal(s.writes,0);
});
test('array objects with custom properties are not valid archive entries',()=>{
 const item=[];item.id='sabc';item.createdAt=1000;item.project=project();
 const s=store(),parsed={version:1,items:[item]};
 assert.throws(()=>importArchiveBackup(s,parsed,null),/Archivstand/);
 assert.throws(()=>mergeArchiveBackup(s,parsed,null),/Archivstand/);
 assert.equal(s.getItem(ARCHIVE_KEY),null);
});
test('portable serialization refuses sparse and array-shaped entries',()=>{
 const sparse=new Array(1);
 assert.throws(()=>serializeArchiveBackup({state:'ok',items:sparse}),/Archivstand/);
 const item=[];item.id='sabc';item.createdAt=1000;item.project=project();
 assert.throws(()=>serializeArchiveBackup({state:'ok',items:[item]}),/Archivstand/);
});
test('post-write check rejects exact bytes that cannot be read as an archive',()=>{
 const s=store(),bad=JSON.stringify({version:1,items:[entry(['sabc'])]});
 s.setItem(ARCHIVE_KEY,bad);
 assert.throws(()=>verifyArchiveWrite(s,bad),{code:'ARCHIVE_CONFLICT'});
 assert.equal(s.getItem(ARCHIVE_KEY),bad);
});
test('post-write check accepts a valid archive and never touches unrelated keys',()=>{
 const s=store(),raw=JSON.stringify({version:1,items:[entry('sabc')]});
 s.setItem('other','untouched');s.setItem(ARCHIVE_KEY,raw);
 const before=s.snapshot(),writes=s.writes;
 assert.equal(verifyArchiveWrite(s,raw),undefined);
 assert.equal(s.writes,writes);assert.deepEqual(s.snapshot(),before);
 assert.throws(()=>verifyArchiveWrite(s,raw+' '),{code:'ARCHIVE_CONFLICT'});
});
