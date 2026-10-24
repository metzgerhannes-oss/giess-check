// Warn about in-memory edits that have not been persisted. Browsers may ignore
// beforeunload (notably on mobile); JSON export remains the recovery path.
export function createUnsavedGuard(target){
 let dirty=false;
 function beforeUnload(event){
  if(!dirty)return;
  event.preventDefault();
  event.returnValue='';
 }
 target.addEventListener('beforeunload',beforeUnload);
 return {
  setDirty(value){dirty=Boolean(value);},
  isDirty(){return dirty;},
  dispose(){target.removeEventListener('beforeunload',beforeUnload);}
 };
}
