import {validateProject} from './core.mjs';
import {PRIMARY_KEY,BACKUP_KEY} from './storage.mjs';
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
 // A slow file read may outlive the archive revision shown to the user.
 // Refuse a stale import before asking for confirmation at all.
 assertArchiveVersion(storage,expectedRaw);
 // Confirmation may be asynchronous (custom dialogs, accessibility flows).
 // Never interpret a pending Promise as approval; recheck the same revision
 // inside importArchiveBackup after confirmation settles.
 if(!(await approve(parsed.items.length)))return null;
 return importArchiveBackup(storage,parsed,expectedRaw);
}


function prepareArchiveMerge(existing,incoming){
 const merged=normalizeItems(existing),newItems=normalizeItems(incoming);
 const byId=new Map(merged.map(item=>[item.id,item]));
 let added=0;
 for(const item of newItems){
  const previous=byId.get(item.id);
  if(previous&&JSON.stringify(previous)===JSON.stringify(item))continue;
  let id=item.id;
  if(previous){
   // Preserve both entries when an imported ID names different contents.
   let counter=0;
   do{
    const suffix='_'+(++counter).toString(36);
    id='s'+item.id.slice(1,39-1-suffix.length)+suffix;
   }while(byId.has(id));
  }
  const entry=id===item.id?item:{...item,id};
  merged.push(entry);byId.set(id,entry);added++;
 }
 if(merged.length>ARCHIVE_CAP)throw new Error('Zusammenführung überschreitet 12 Archivstände; nichts wurde überschrieben.');
 merged.sort((a,b)=>b.createdAt-a.createdAt);
 const payload=JSON.stringify({version:1,items:merged});
 if(byteSize(payload)>MAX_ARCHIVE_BYTES)throw new Error('Zusammenführung überschreitet 350 KB; nichts wurde überschrieben.');
 return {added,total:merged.length,payload};
}
// Non-destructive merge: validate and preflight before a single atomic key
// replacement. The expected revision is rechecked immediately before writing.
export function mergeArchiveBackup(storage,parsed,expectedRaw=undefined){
 if(!storage)throw new Error('Browser-Speicher nicht verfügbar.');
 const state=readArchive(storage);
 if(state.state==='damaged'||state.state==='unavailable')throw new Error('Vorhandenes Archiv beschädigt oder nicht verfügbar; nichts wurde überschrieben.');
 const baseline=expectedRaw===undefined?state.raw:expectedRaw;
 if(state.raw!==baseline){
  const error=new Error('Archiv wurde in einem anderen Tab geändert.');
  error.code='ARCHIVE_CONFLICT';throw error;
 }
 if(!parsed||parsed.version!==1)throw new Error('Ungültiges Archivformat.');
 const plan=prepareArchiveMerge(state.items,parsed.items);
 assertArchiveVersion(storage,baseline);
 if(plan.added===0)return 0;
 storage.setItem(ARCHIVE_KEY,plan.payload);
 verifyArchiveWrite(storage,plan.payload);
 return plan.added;
}
export async function mergeArchiveBackupAsync(storage,readText,expectedRaw,approve){
 if(!storage)throw new Error('Browser-Speicher nicht verfügbar.');
 const initial=readArchive(storage);
 if(initial.state==='damaged'||initial.state==='unavailable')throw new Error('Vorhandenes Archiv beschädigt oder nicht verfügbar; nichts wurde überschrieben.');
 if(expectedRaw===undefined||initial.raw!==expectedRaw){
  const error=new Error('Archiv wurde in einem anderen Tab geändert.');
  error.code='ARCHIVE_CONFLICT';throw error;
 }
 const parsed=parseArchiveBackup(await readText());
 const preview=prepareArchiveMerge(initial.items,parsed.items);
 assertArchiveVersion(storage,expectedRaw);
 if(preview.added===0)return 0;
 if(!(await approve(preview.added,preview.total)))return null;
 return mergeArchiveBackup(storage,parsed,expectedRaw);
}

// Read-only emergency export: exact raw values, never a valid import format.
export const MAX_RAW_RESCUE_BYTES=2_000_000;
export function exportRawRecovery(storage){
 if(!storage)throw new Error('Browser-Speicher für die Notfallsicherung nicht verfügbar.');
 const entries=[];
 for(const key of [PRIMARY_KEY,BACKUP_KEY,ARCHIVE_KEY]){
  const raw=storage.getItem(key);
  if(raw!==null&&(typeof raw!=='string'||raw.length>MAX_RAW_RESCUE_BYTES)){
   throw new Error('Rohdaten zu groß oder ungültig; vorhandene Daten bleiben unverändert.');
  }
  entries.push([key,raw]);
 }
 if(entries.every(([,raw])=>raw===null))throw new Error('Keine lokalen Rohdaten für eine Notfallsicherung vorhanden.');
 for(const [key,raw] of entries){
  if(storage.getItem(key)!==raw){
   const error=new Error('Browserdaten während der Notfallsicherung geändert. Bitte erneut versuchen.');
   error.code='STORAGE_CONFLICT';
   throw error;
  }
 }
 const payload=JSON.stringify({format:'klarpunkt-raw-rescue',version:1,raw:Object.fromEntries(entries)});
 if(new TextEncoder().encode(payload).byteLength>MAX_RAW_RESCUE_BYTES){
  throw new Error('Rohdaten überschreiten 2 MB; vorhandene Daten bleiben unverändert.');
 }
 return payload;
}
