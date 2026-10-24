import {validateProject} from './core.mjs';

// The archive is independent of the active-project storage and never uploads data.
export const ARCHIVE_KEY='klarpunkt.archive.v1';
export const ARCHIVE_CAP=12;
export const MAX_ARCHIVE_BYTES=350000;
const byteSize=text=>new TextEncoder().encode(text).byteLength;

export function readArchive(storage){
 if(!storage)return {state:'unavailable',items:[],raw:undefined};
 let raw;
 try{raw=storage.getItem(ARCHIVE_KEY);}
 catch{return {state:'unavailable',items:[],raw:undefined};}
 try{
  if(raw===null)return {state:'new',items:[],raw};
  if(raw.length>MAX_ARCHIVE_BYTES||byteSize(raw)>MAX_ARCHIVE_BYTES)throw new Error('Oversized archive');
  const parsed=JSON.parse(raw);
  if(!parsed || parsed.version!==1 || !Array.isArray(parsed.items) || parsed.items.length>ARCHIVE_CAP)throw new Error('Invalid archive');
  const seen=new Set();
  const items=parsed.items.map(item=>{
   if(!item || !/^s[a-z0-9_]{1,39}$/.test(item.id) || seen.has(item.id) ||
       !Number.isSafeInteger(item.createdAt) || item.createdAt<1)throw new Error('Invalid archive entry');
   seen.add(item.id);
   return {id:item.id,createdAt:item.createdAt,project:validateProject(item.project)};
  });
  return {state:'ok',items,raw};
 }catch{return {state:'damaged',items:[],raw:undefined};}
}

export function assertArchiveVersion(storage,expectedRaw){
 // Best-effort optimistic check; localStorage does not offer atomic compare-and-swap.
 if(expectedRaw!==undefined&&storage.getItem(ARCHIVE_KEY)!==expectedRaw){
  const error=new Error('Archiv wurde in einem anderen Tab geändert.');
  error.code='ARCHIVE_CONFLICT';
  throw error;
 }
}
function writeArchive(storage,items,expectedRaw){
 assertArchiveVersion(storage,expectedRaw);
 const payload=JSON.stringify({version:1,items});
 if(byteSize(payload)>MAX_ARCHIVE_BYTES)throw new Error('Archiv überschreitet 350 KB; vorhandene Daten bleiben unverändert.');
 storage.setItem(ARCHIVE_KEY,payload);
}
export function addSnapshot(storage,project,now=Date.now(),expectedRaw=undefined){
 const state=readArchive(storage);
 if(state.state==='damaged'||state.state==='unavailable')throw new Error('Archiv nicht verfügbar oder beschädigt; vorhandene Daten bleiben unverändert.');
 if(state.items.length>=ARCHIVE_CAP)throw new Error('Archiv voll. Bitte zuerst einen Eintrag entfernen.');
 const copy=validateProject(project);
 const numericTime=Number(now);
 const timestamp=Math.floor(numericTime);
 if(!Number.isSafeInteger(timestamp)||timestamp<1)throw new Error('Ungültiger Zeitstempel; Archiv unverändert.');
 let n=0,id;
 do{id='s'+timestamp.toString(36)+'_'+(++n).toString(36)}while(state.items.some(entry=>entry.id===id));
 const item={id,createdAt:timestamp,project:copy};
 writeArchive(storage,[item,...state.items],expectedRaw===undefined?state.raw:expectedRaw);
 return item;
}
export function removeSnapshot(storage,id,expectedRaw=undefined){
 const state=readArchive(storage);
 if(state.state==='damaged'||state.state==='unavailable')throw new Error('Archiv nicht verfügbar oder beschädigt.');
 if(!state.items.some(item=>item.id===id))throw new Error('Eintrag nicht gefunden.');
 writeArchive(storage,state.items.filter(item=>item.id!==id),expectedRaw===undefined?state.raw:expectedRaw);
 return true;
}
