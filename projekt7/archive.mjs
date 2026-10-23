import {validateProject} from './core.mjs';

// The archive is independent of the active-project storage and never uploads data.
export const ARCHIVE_KEY='klarpunkt.archive.v1';
export const ARCHIVE_CAP=12;

export function readArchive(storage){
 if(!storage)return {state:'unavailable',items:[]};
 try{
  const raw=storage.getItem(ARCHIVE_KEY);
  if(raw===null)return {state:'new',items:[]};
  if(raw.length>350000)throw new Error('Oversized archive');
  const parsed=JSON.parse(raw);
  if(!parsed || parsed.version!==1 || !Array.isArray(parsed.items) || parsed.items.length>ARCHIVE_CAP)throw new Error('Invalid archive');
  const seen=new Set();
  const items=parsed.items.map(item=>{
   if(!item || !/^s[a-z0-9_]{1,39}$/.test(item.id) || seen.has(item.id) ||
       !Number.isSafeInteger(item.createdAt) || item.createdAt<1)throw new Error('Invalid archive entry');
   seen.add(item.id);
   return {id:item.id,createdAt:item.createdAt,project:validateProject(item.project)};
  });
  return {state:'ok',items};
 }catch{return {state:'damaged',items:[]};}
}

function writeArchive(storage,items){
 storage.setItem(ARCHIVE_KEY,JSON.stringify({version:1,items}));
}
export function addSnapshot(storage,project,now=Date.now()){
 const state=readArchive(storage);
 if(state.state==='damaged'||state.state==='unavailable')throw new Error('Archiv nicht verfügbar oder beschädigt; vorhandene Daten bleiben unverändert.');
 if(state.items.length>=ARCHIVE_CAP)throw new Error('Archiv voll. Bitte zuerst einen Eintrag entfernen.');
 const copy=validateProject(project);
 const timestamp=Math.max(1,Math.floor(Number(now)||Date.now()));
 let n=0,id;
 do{id='s'+timestamp.toString(36)+'_'+(++n).toString(36)}while(state.items.some(entry=>entry.id===id));
 const item={id,createdAt:timestamp,project:copy};
 writeArchive(storage,[item,...state.items]);
 return item;
}
export function removeSnapshot(storage,id){
 const state=readArchive(storage);
 if(state.state==='damaged'||state.state==='unavailable')throw new Error('Archiv nicht verfügbar oder beschädigt.');
 if(!state.items.some(item=>item.id===id))throw new Error('Eintrag nicht gefunden.');
 writeArchive(storage,state.items.filter(item=>item.id!==id));
 return true;
}
