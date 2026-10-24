import {validateProject} from './core.mjs';
import {ARCHIVE_CAP,ARCHIVE_KEY,MAX_ARCHIVE_BYTES,readArchive,assertArchiveVersion,verifyArchiveWrite} from './archive.mjs';

// Independent portable archive. Import replaces only the archive key, never
// the active project or its backup. No network calls or dependencies.
export const MAX_ARCHIVE_FILE_BYTES=MAX_ARCHIVE_BYTES;
const byteSize=value=>new TextEncoder().encode(value).byteLength;
function normalizeItems(items){
 if(!Array.isArray(items)||items.length>ARCHIVE_CAP)throw new Error('Unzulässige Anzahl an Archivständen.');
 const ids=new Set();
 return items.map(item=>{
  if(!item||typeof item!=='object'||typeof item.id!=='string'||
     !/^s[a-z0-9_]{1,39}$/.test(item.id)||ids.has(item.id)||
     !Number.isSafeInteger(item.createdAt)||item.createdAt<1){
   throw new Error('Ungültiger Archivstand.');
  }
  ids.add(item.id);
  return {id:item.id,createdAt:item.createdAt,project:validateProject(item.project)};
 });
}
function checkSize(json){
 if(byteSize(json)>MAX_ARCHIVE_FILE_BYTES)throw new Error('Archivdatei überschreitet 350 KB.');
 return json;
}
export function serializeArchiveBackup(state){
 if(!state||(state.state!=='new'&&state.state!=='ok')){
  throw new Error('Archiv beschädigt oder nicht verfügbar; nichts wurde überschrieben.');
 }
 return checkSize(JSON.stringify({format:'klarpunkt-archive',version:1,items:normalizeItems(state.items)},null,2));
}
export function parseArchiveBackup(text){
 if(typeof text!=='string')throw new Error('Keine gültige Archivdatei.');
 const clean=checkSize(text.replace(/^\uFEFF/,''));
 let parsed;
 try{parsed=JSON.parse(clean);}
 catch{throw new Error('Archivdatei ist kein gültiges JSON.');}
 if(!parsed||parsed.format!=='klarpunkt-archive'||parsed.version!==1){
  throw new Error('Unbekanntes Archivformat.');
 }
 return {version:1,items:normalizeItems(parsed.items)};
}
export function importArchiveBackup(storage,parsed,expectedRaw=undefined){
 if(!storage)throw new Error('Browser-Speicher nicht verfügbar.');
 const state=readArchive(storage);
 if(state.state==='damaged'||state.state==='unavailable'){
  throw new Error('Vorhandenes Archiv beschädigt oder nicht verfügbar; nichts wurde überschrieben.');
 }
 const baseline=expectedRaw===undefined?state.raw:expectedRaw;
 if(state.raw!==baseline){
  const error=new Error('Archiv wurde in einem anderen Tab geändert.');
  error.code='ARCHIVE_CONFLICT';
  throw error;
 }
 if(!parsed||parsed.version!==1)throw new Error('Ungültiges Archivformat.');
 const payload=JSON.stringify({version:1,items:normalizeItems(parsed.items)});
 checkSize(payload);
 // Validation may be expensive; detect an intervening tab write immediately
 // before replacement. localStorage still has no atomic compare-and-swap.
 assertArchiveVersion(storage,baseline);
 // One atomic localStorage.setItem; quota errors preserve the previous archive.
 storage.setItem(ARCHIVE_KEY,payload);
 verifyArchiveWrite(storage,payload);
 return parsed.items.length;
}

// Capture and check the displayed archive revision before asynchronous file
// reading and the confirmation dialog. A storage event may refresh the UI
// during either step, but must never silently rebase this replacement.
export async function importArchiveBackupAsync(storage,readText,expectedRaw,approve){
 if(!storage)throw new Error('Browser-Speicher nicht verfügbar.');
 const initial=readArchive(storage);
 if(initial.state==='damaged'||initial.state==='unavailable'){
  throw new Error('Vorhandenes Archiv beschädigt oder nicht verfügbar; nichts wurde überschrieben.');
 }
 if(expectedRaw===undefined||initial.raw!==expectedRaw){
  const error=new Error('Archiv wurde in einem anderen Tab geändert.');
  error.code='ARCHIVE_CONFLICT';
  throw error;
 }
 const parsed=parseArchiveBackup(await readText());
 if(!approve(parsed.items.length))return null;
 return importArchiveBackup(storage,parsed,expectedRaw);
}
