import {starterProject,validateProject} from './core.mjs';
import {MAX_BACKUP_BYTES} from './backup.mjs';
export const PRIMARY_KEY='klarpunkt.project.v1';
export const BACKUP_KEY='klarpunkt.project.backup.v1';
// A corrupt browser key must not force unbounded JSON parsing or make a
// valid bounded recovery copy inaccessible. Keep the same limit as file backup.
function decode(raw){
 if(raw===null)return null;
 if(typeof raw!=='string'||raw.length>MAX_BACKUP_BYTES||new TextEncoder().encode(raw).byteLength>MAX_BACKUP_BYTES){
  throw new Error('Lokaler Projektstand überschreitet die sichere Größe.');
 }
 return validateProject(JSON.parse(raw));
}
export function inspectStorage(storage){
 if(!storage)return {state:'unavailable',project:starterProject(),primaryRaw:undefined};
 let primary;
 try{primary=storage.getItem(PRIMARY_KEY);}
 catch{return {state:'unavailable',project:starterProject(),primaryRaw:undefined};}
 // The active project is authoritative. A denied optional-backup read must not
 // hide a healthy primary or make the app appear empty.
 if(primary!==null){
  try{
   const value=decode(primary);
   if(value)return {state:'ok',project:value,primaryRaw:primary};
  }catch{}
 }
 let backup;
 try{backup=storage.getItem(BACKUP_KEY);}
 catch{return {state:'unavailable',project:starterProject(),primaryRaw:primary};}
 if(primary===null&&backup===null)return {state:'new',project:starterProject(),primaryRaw:primary};
 try{
  const value=decode(backup);
  if(value)return {state:'recovered',project:value,primaryRaw:primary};
 }catch{}
 return {state:'damaged',project:starterProject(),primaryRaw:primary};
}
export function saveProject(storage,project,override=false,expectedPrimaryRaw=undefined,onBackupFailure=null){
 const clean=validateProject(project);
 const current=storage.getItem(PRIMARY_KEY);
 // Best-effort optimistic precondition: localStorage has no atomic compare-and-swap.
 if(expectedPrimaryRaw!==undefined&&current!==expectedPrimaryRaw){
  const error=new Error('Der Browserstand wurde in einem anderen Tab geändert.');
  error.code='STORAGE_CONFLICT';
  throw error;
 }
 let last=null;
 if(current!==null){
  try{last=decode(current);}
  catch{
   if(!override)throw new Error('Lokale Sicherung ist beschädigt.');
  }
 }
 const nextRaw=JSON.stringify(clean);
 if(new TextEncoder().encode(nextRaw).byteLength>MAX_BACKUP_BYTES)throw new Error('Projekt überschreitet die sichere Speichergröße.');
 let backupRaw=null;
 let seedBackup=false;
 if(last){
  // A valid primary is sufficient to produce a recovery copy. Never require
  // permission to read an optional backup before committing valid active data.
  backupRaw=JSON.stringify(last);
 }else{
  // No valid primary: read the existing backup before any write. If access is
  // denied, do not hide a potentially recoverable copy behind a new primary.
  const previousBackup=storage.getItem(BACKUP_KEY);
  if(current===null&&previousBackup===null){backupRaw=nextRaw;seedBackup=true;}
 }
 // A second read narrows the inter-tab race window. A revision observed during
 // backup preparation must never be silently replaced by this tab.
 if(storage.getItem(PRIMARY_KEY)!==current){
  const error=new Error('Der Browserstand wurde während des Speicherns geändert.');
  error.code='STORAGE_CONFLICT';
  throw error;
 }
 // Save the active version first: a failed primary write never changes backup.
 // Separate localStorage keys are not an atomic transaction.
 storage.setItem(PRIMARY_KEY,nextRaw);
 // A storage adapter or a racing tab can acknowledge a write without retaining
 // the intended value. Do not advance the recovery copy unless it is readable
 // back byte-for-byte. A failed verification is never reported as a safe save.
 if(storage.getItem(PRIMARY_KEY)!==nextRaw){
  const error=new Error('Gespeicherter Browserstand konnte nicht bestätigt werden.');
  error.code='STORAGE_CONFLICT';
  throw error;
 }
 if(backupRaw!==null){
  try{
   // When seeding an empty store, preserve a recovery copy another tab may
   // have written since the initial read. Primary is already committed.
   if(seedBackup&&storage.getItem(BACKUP_KEY)!==null){
    throw new Error('Zusätzliche Sicherung wurde zwischenzeitlich geändert.');
   }
   storage.setItem(BACKUP_KEY,backupRaw);
   // The backup is optional, but a silent failed write must be surfaced as a
   // reduced-redundancy warning rather than claimed as a durable recovery copy.
   if(storage.getItem(BACKUP_KEY)!==backupRaw){
    throw new Error('Zusätzliche Sicherung konnte nicht bestätigt werden.');
   }
  }catch(error){
   // Active data is saved; the previous backup is unchanged.
   // A warning listener must never turn an already committed primary write
   // into an apparent failure (which could trigger a destructive retry).
   try{if(typeof onBackupFailure==='function')onBackupFailure(error);}catch{}
  }
 }
 return clean;
}

// A resumed tab must not trust an old in-memory revision. A failed read or
// an unknown startup revision is never evidence that overwriting is safe.
export function inspectPrimaryRevision(storage,expectedRaw){
 if(!storage)return 'unavailable';
 let current;
 try{current=storage.getItem(PRIMARY_KEY);}
 catch{return 'unavailable';}
 if(expectedRaw===undefined)return 'unverified';
 return current===expectedRaw?'unchanged':'changed';
}

// A storage.clear() event has key=null and newValue=null. It must invalidate
// a tab even when that tab originally observed an empty primary key.
export function storageEventConflicts(key,newValue,expectedRaw){
 return key===null||(key===PRIMARY_KEY&&newValue!==expectedRaw);
}
