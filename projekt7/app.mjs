import {starterProject,blankProject,validateProject,evaluate,MAX_OPTIONS,MAX_CRITERIA} from './core.mjs';
import {inspectStorage,saveProject,PRIMARY_KEY} from './storage.mjs';
import {createHistory} from './history.mjs';
import {createUnsavedGuard} from './unsaved.mjs';
import {readArchive,addSnapshot,removeSnapshot,ARCHIVE_CAP,ARCHIVE_KEY} from './archive.mjs';
import {serializeBackup,parseBackupText,MAX_BACKUP_BYTES} from './backup.mjs';
import {serializeArchiveBackup,parseArchiveBackup,importArchiveBackup,MAX_ARCHIVE_FILE_BYTES} from './archive-transfer.mjs';

const byId=id=>document.getElementById(id);
const status=byId('save-status');
const unsavedGuard=createUnsavedGuard(window);
const make=(tag,className='',text='')=>{
 const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;
};
const labelFor=(input,text)=>{
 const l=make('label','field-label',text);l.htmlFor=input.id;return l;
};
const initial=load();
let project=initial.project;
let history=createHistory(project);
let storageState=initial.state;
let expectedPrimaryRaw=initial.primaryRaw;
let expectedArchiveRaw=undefined;
let idCounter=0;
let resultAnnouncementTimer;

function browserStore(){try{return window.localStorage;}catch{return null;}}
function load(){
 try{return inspectStorage(window.localStorage);}
 catch{return inspectStorage(null);}
}
function updateHistoryButtons(){byId('undo').disabled=!history.canUndo();byId('redo').disabled=!history.canRedo();}
function markConflict(){
 storageState='conflict';
 byId('reload-storage').hidden=false;
 status.textContent='Anderer Tab hat Browserdaten geändert. Dieser Tab überschreibt nichts. Bitte erst Datei-Sicherung speichern oder den aktuellen Browserstand laden.';
}
function save(record=true){
 if(record)history.push(project);
 updateHistoryButtons();
 unsavedGuard.setDirty(true);
 if(storageState==='conflict'){markConflict();return false;}
 if(storageState==='damaged'){
  status.textContent='Ungespeicherte Änderungen! Vorhandene Browserdaten beschädigt und unverändert. Bitte eine JSON-Sicherung herunterladen.';
  return false;
 }
 try{
  let backupWarning=false;
  const clean=saveProject(window.localStorage,project,storageState==='recovered',expectedPrimaryRaw,()=>{backupWarning=true;});
  expectedPrimaryRaw=JSON.stringify(clean);
  storageState='ok';
  unsavedGuard.setDirty(false);
  status.textContent=backupWarning
   ?'Aktueller Stand gespeichert, aber zusätzliche lokale Sicherung konnte nicht aktualisiert werden. Bitte eine JSON-Datei sichern.'
   :'Automatisch gespeichert · nur auf diesem Gerät';
  return true;
 }catch(err){
  if(err?.code==='STORAGE_CONFLICT'){markConflict();return false;}
  status.textContent='Ungespeicherte Änderungen! Browser-Speichern nicht möglich – bitte eine JSON-Sicherung herunterladen.';
  return false;
 }
}
function replaceDamagedStorage(){
 if(storageState==='conflict'){markConflict();return false;}
 if(storageState!=='damaged')return true;
 if(!confirm('Die bisher gespeicherten Daten sind beschädigt. Mit dem Fortfahren werden die beschädigten Daten ersetzt. Nur fortfahren, wenn du eine verfügbare Sicherung geprüft hast.'))return false;
 storageState='recovered';
 return true;
}
function startupStatus(){
 if(initial.state==='recovered')status.textContent='Lokale Sicherung wiederhergestellt. Bitte jetzt eine Sicherung als Datei speichern.';
 else if(initial.state==='damaged')status.textContent='Lokale Daten beschädigt. Vorhandene Daten wurden nicht überschrieben.';
 else if(initial.state==='unavailable')status.textContent='Browser-Speicher nicht verfügbar. Bitte Sicherung als Datei speichern.';
}
function uniqueId(prefix,list){
 let id;
 do{id=prefix+Date.now().toString(36)+(++idCounter).toString(36);}while(list.some(x=>x.id===id));
 return id;
}
function rename(input,callback){
 input.addEventListener('input',()=>{callback(input.value);save();renderResults();});
}
function elementButton(text,cls,fn,label){
 const b=make('button',cls,text);b.type='button';if(label)b.setAttribute('aria-label',label);
 b.addEventListener('click',fn);return b;
}
function renderOptions(){
 const root=byId('options');root.replaceChildren();
 project.options.forEach((option,index)=>{
  const row=make('div','option-entry');
  row.append(make('span','index-tag',String.fromCharCode(65+index)));
  const input=make('input','entry-input');input.type='text';input.maxLength=80;input.value=option.name;
  input.setAttribute('aria-label','Möglichkeit '+(index+1));
  input.autocomplete='off';
  input.addEventListener('input',()=>{
   option.name=input.value;
   save();renderCriteria();renderResults();
  });
  row.append(input);
  const remove=elementButton('×','icon-button',()=>{
   if(project.options.length<=2)return;
   project.options=project.options.filter(o=>o.id!==option.id);
   for(const criterion of project.criteria)delete criterion.ratings[option.id];
   changed();
   const inputs=byId('options').querySelectorAll('.option-entry input');
   inputs[Math.min(index,inputs.length-1)]?.focus();
  },'Möglichkeit '+(index+1)+' entfernen');
  remove.disabled=project.options.length<=2;
  row.append(remove);root.append(row);
 });
 byId('add-option').disabled=project.options.length>=MAX_OPTIONS;
}
function addSlider(parent,{title,min,max,value,onChange,step=1,format=x=>String(x),id,context=''}){
 const box=make('div','range-control');
 const label=make('label');label.htmlFor=id;
 const titleSpan=make('span','',title);const output=make('output','',format(value));
 output.htmlFor=id;label.append(titleSpan,output);
 const input=make('input');input.type='range';input.id=id;input.min=String(min);input.max=String(max);
 input.step=String(step);input.value=String(value);
 input.setAttribute('aria-label',title+(context?' – '+context:''));
 input.addEventListener('input',()=>{
  const v=Number(input.value);output.textContent=format(v);onChange(v);save();renderResults();
 });
 box.append(label,input);parent.append(box);
}
function renderCriteria(){
 const root=byId('criteria');root.replaceChildren();
 project.criteria.forEach((criterion,criterionIndex)=>{
  const card=make('article','criterion-card');
  const heading=make('div','criterion-head');
  const input=make('input','criterion-name');input.type='text';input.maxLength=80;input.value=criterion.name;
  input.setAttribute('aria-label','Kriterium '+(criterionIndex+1));
  rename(input,value=>{criterion.name=value;});
  const remove=elementButton('×','icon-button',()=>{
   if(project.criteria.length<=1)return;
   project.criteria=project.criteria.filter(c=>c.id!==criterion.id);changed();
   const inputs=byId('criteria').querySelectorAll('.criterion-name');
   inputs[Math.min(criterionIndex,inputs.length-1)]?.focus();
  },'Kriterium '+(criterionIndex+1)+' entfernen');
  remove.disabled=project.criteria.length<=1;heading.append(input,remove);
  card.append(heading);
  const settings=make('div','control-row');
  addSlider(settings,{
   title:'Wichtigkeit',min:1,max:5,value:criterion.weight,
   id:'weight-'+criterion.id,context:criterion.name,onChange:v=>{criterion.weight=v;},
   format:v=>v+'/5'
  });
  addSlider(settings,{
   title:'Unsicherheit',min:0,max:3,value:criterion.uncertainty,
   id:'uncertainty-'+criterion.id,context:criterion.name,onChange:v=>{criterion.uncertainty=v;},
   format:v=>['keine','gering','mittel','hoch'][v]
  });
  card.append(settings);
  const ratingSection=make('div','ratings');
  project.options.forEach((option,index)=>{
   const row=make('div','rating-row');
   const label=make('label','rating-label',option.name||'Möglichkeit '+(index+1));
   const id='rating-'+criterion.id+'-'+option.id;label.htmlFor=id;
   const range=make('input');range.type='range';range.min='0';range.max='10';range.step='1';
   range.id=id;range.value=String(criterion.ratings[option.id]??5);
   range.setAttribute('aria-label','Bewertung: '+(option.name||'Möglichkeit '+(index+1))+' – '+criterion.name);
   const output=make('output','rating-value',range.value);output.htmlFor=id;
   range.addEventListener('input',()=>{
    criterion.ratings[option.id]=Number(range.value);output.textContent=range.value;save();renderResults();
   });
   row.append(label,range,output);ratingSection.append(row);
  });
  card.append(ratingSection);root.append(card);
 });
 byId('add-criterion').disabled=project.criteria.length>=MAX_CRITERIA;
}
function renderResults(){
 const root=byId('results');root.replaceChildren();
 let result;
 try{result=evaluate(project);}catch(err){
  root.append(make('p','', 'Die Auswertung ist vorübergehend nicht verfügbar.'));return;
 }
 const {best,runner,margin,ranked}=result;
 const winner=make('div','winner'+(margin<.05?' neutral':''));
 winner.append(make('small','',margin<.05?'GLEICHSTAND':'AKTUELL VORNE'));
 winner.append(make('strong','',margin<.05?'Sehr knapp – du entscheidest':best.name));
 const winnerText=margin<.05
  ?'Die Bewertungen liegen gleichauf. Eine kleine Änderung kann den Ausschlag geben.'
  :result.stable?'Das Ergebnis bleibt in den meisten angenommenen Szenarien vorne.':'Das Ergebnis ist empfindlich gegenüber kleinen Änderungen.';
 winner.append(make('p','',winnerText));root.append(winner);
 const ranks=make('div','rankings');
 ranked.forEach((option,index)=>{
  const row=make('div','rank-item');
  const heading=make('div','rank-heading');
  heading.append(make('span','',(index+1)+'. '+option.name),make('strong','',option.score.toLocaleString('de-DE',{maximumFractionDigits:1,minimumFractionDigits:1})+' / 10'));
  const track=make('div','bar-track');
  const bar=make('div','bar-fill');bar.style.width=Math.max(0,Math.min(100,option.score*10))+'%';
  track.setAttribute('role','img');track.setAttribute('aria-label',option.name+': '+option.score.toFixed(1)+' von 10 Punkten');
  track.append(bar);
  row.append(heading,track);
  row.append(make('div','rank-meta',option.stability+' % der simulierten Varianten vorne'));
  ranks.append(row);
 });
 root.append(ranks);
 const box=make('div','explainer');
 const driver=result.drivers.find(d=>d.delta>0.001);
 box.append(make('strong','',margin<.05?'Wichtige Einordnung':'Was den Unterschied macht'));
 const explanation=margin<.05
  ?'Kein klarer Vorsprung. Prüfe, ob die Kriterien vollständig sind oder die Gewichtung zu dir passt.'
  :driver?'Der größte rechnerische Vorteil gegenüber Platz 2 liegt bei „'+driver.name+'“. Die Differenz beträgt '+margin.toLocaleString('de-DE',{maximumFractionDigits:2})+' Punkte.'
  :'Das Ergebnis wird aus deinen Bewertungen und Gewichtungen berechnet.';
 box.append(make('p','',explanation));
 root.append(box);
 clearTimeout(resultAnnouncementTimer);
 resultAnnouncementTimer=setTimeout(()=>{
  byId('result-announcement').textContent=margin<.05
   ?'Aktuelles Ergebnis: nahezu Gleichstand.'
   :'Aktuell vorne: '+best.name+', '+best.score.toLocaleString('de-DE',{maximumFractionDigits:1})+' von 10 Punkten.';
 },450);
}
function renderAll(){
 byId('project-title').value=project.title;
 renderOptions();renderCriteria();renderResults();
}
function changed(){const persisted=save();renderAll();return persisted;}
function restoreHistory(direction){
 const snapshot=direction==='undo'?history.undo():history.redo();
 if(!snapshot)return;
 project=snapshot;save(false);renderAll();
}
byId('undo').addEventListener('click',()=>restoreHistory('undo'));
byId('redo').addEventListener('click',()=>restoreHistory('redo'));
document.addEventListener('keydown',event=>{
 if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
 if(event.target instanceof Element&&event.target.closest('input,textarea,[contenteditable]'))return;
 const key=event.key.toLowerCase();
 if(key==='z'||key==='y'){
  event.preventDefault();
  restoreHistory(key==='y'||(key==='z'&&event.shiftKey)?'redo':'undo');
 }
});
byId('project-title').addEventListener('input',e=>{project.title=e.target.value;save();});
byId('add-option').addEventListener('click',()=>{
 if(project.options.length>=MAX_OPTIONS)return;
 const id=uniqueId('o',project.options);
 project.options.push({id,name:'Neue Möglichkeit'});
 for(const c of project.criteria)c.ratings[id]=5;
 changed();
 byId('options').querySelector('.option-entry:last-child input')?.focus();
});
byId('add-criterion').addEventListener('click',()=>{
 if(project.criteria.length>=MAX_CRITERIA)return;
 const ratings=Object.fromEntries(project.options.map(o=>[o.id,5]));
 project.criteria.push({id:uniqueId('c',project.criteria),name:'Neues Kriterium',weight:3,uncertainty:1,ratings});
 changed();
 byId('criteria').querySelector('.criterion-card:last-child .criterion-name')?.focus();
});
byId('new-project').addEventListener('click',()=>{
 if(!confirm('Aktuelle Entscheidung ersetzen? Lade bei Bedarf vorher eine Sicherung herunter.'))return;
 if(!replaceDamagedStorage())return;
 project=blankProject();changed();
});
byId('load-example').addEventListener('click',()=>{
 if(!confirm('Aktuelle Entscheidung durch das Beispiel ersetzen?'))return;
 if(!replaceDamagedStorage())return;
 project=starterProject();changed();
});
byId('print').addEventListener('click',()=>window.print());
byId('export').addEventListener('click',()=>{
 try{
  const data=serializeBackup(project);
  const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const link=make('a');link.href=url;link.download='klarpunkt-sicherung-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  status.textContent='Sicherung erstellt. Datei bitte sicher aufbewahren.';
 }catch(err){status.textContent='Sicherung konnte nicht erstellt werden.';}
});
byId('import').addEventListener('click',()=>byId('import-file').click());
byId('import-file').addEventListener('change',async event=>{
 const file=event.target.files?.[0];event.target.value='';
 if(!file)return;
 if(file.size>MAX_BACKUP_BYTES){alert('Datei zu groß (maximal 100 KB).');return;}
 try{
  const input=parseBackupText(await file.text());
  if(!confirm('Aktuelle Entscheidung durch diese Sicherung ersetzen?'))return;
  if(!replaceDamagedStorage())return;
  project=input;
  if(changed())status.textContent='Sicherung erfolgreich eingelesen · lokal gespeichert';
 }catch(err){alert('Sicherung konnte nicht geöffnet werden: '+(err?.message||'ungültige Datei'));}
});
function renderArchive(){
 const list=byId('archive-list'),store=browserStore(),state=readArchive(store);
 expectedArchiveRaw=state.raw;
 list.replaceChildren();
 const saveButton=byId('archive-save');
 saveButton.disabled=state.state==='unavailable'||state.state==='damaged'||state.items.length>=ARCHIVE_CAP;
 if(state.state==='unavailable'||state.state==='damaged'){
  list.append(make('p','archive-warning',state.state==='damaged'
   ?'Archivdaten beschädigt – unverändert belassen. Aktuelles Projekt bitte als Datei sichern.'
   :'Lokale Archivierung nicht verfügbar. Aktuelles Projekt bitte als Datei sichern.'));
  return;
 }
 if(!state.items.length){
  list.append(make('p','archive-empty','Noch keine lokal abgelegten Stände.'));
  return;
 }
 for(const item of state.items){
  const row=make('div','archive-item');
  row.setAttribute('role','listitem');
  const info=make('div','archive-info');
  info.append(make('strong','',item.project.title),make('small','',new Date(item.createdAt).toLocaleString('de-DE')));
  const actions=make('div','archive-actions');
  const open=elementButton('Öffnen','button secondary',()=>{
   if(!confirm('Aktuellen Arbeitsstand durch diesen gespeicherten Stand ersetzen? Lade bei Bedarf vorher eine Datei-Sicherung herunter.'))return;
   if(!replaceDamagedStorage())return;
   project=validateProject(item.project);
   if(changed())status.textContent='Gespeicherten Stand geöffnet und lokal gespeichert.';
  },'Gespeicherten Stand öffnen: '+item.project.title);
  const remove=elementButton('Entfernen','button secondary',()=>{
   if(!confirm('Diesen gespeicherten Stand endgültig entfernen?'))return;
   try{removeSnapshot(browserStore(),item.id,expectedArchiveRaw);renderArchive();byId('archive-save').focus();status.textContent='Gespeicherten Stand entfernt.';}
   catch(err){
    if(err?.code==='ARCHIVE_CONFLICT'){renderArchive();status.textContent='Archiv inzwischen geändert. Liste aktualisiert; bitte erneut versuchen.';}
    else status.textContent='Archiv konnte nicht geändert werden. Bestehende Daten bleiben erhalten.';
   }
  },'Gespeicherten Stand entfernen: '+item.project.title);
  actions.append(open,remove);row.append(info,actions);list.append(row);
 }
}
byId('archive-save').addEventListener('click',()=>{
 try{addSnapshot(browserStore(),project,Date.now(),expectedArchiveRaw);renderArchive();status.textContent='Ein weiterer Stand wurde lokal gesichert.';}
 catch(err){
  if(err?.code==='ARCHIVE_CONFLICT'){renderArchive();status.textContent='Archiv inzwischen geändert. Liste aktualisiert; bitte erneut versuchen.';}
  else status.textContent=err?.message||'Lokales Archiv konnte nicht gespeichert werden.';
 }
});
byId('archive-export').addEventListener('click',()=>{
 try{
  const data=serializeArchiveBackup(readArchive(browserStore()));
  const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const link=make('a');link.href=url;link.download='klarpunkt-archiv-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  status.textContent='Archivdatei erstellt. Bitte außerhalb des Browsers aufbewahren.';
 }catch(err){status.textContent=err?.message||'Archiv konnte nicht exportiert werden.';}
});
byId('archive-import').addEventListener('click',()=>byId('archive-import-file').click());
byId('archive-import-file').addEventListener('change',async event=>{
 const file=event.target.files?.[0];event.target.value='';
 if(!file)return;
 if(file.size>MAX_ARCHIVE_FILE_BYTES){alert('Archivdatei zu groß (maximal 350 KB).');return;}
 try{
  const incoming=parseArchiveBackup(await file.text());
  if(!confirm('Das bisherige lokale Archiv durch '+incoming.items.length+' importierte Stände ERSETZEN? Der aktuelle Arbeitsstand bleibt unverändert. Bitte das bisherige Archiv vorher als Datei sichern.'))return;
  const count=importArchiveBackup(browserStore(),incoming,expectedArchiveRaw);
  renderArchive();
  status.textContent=count+' Archivstände importiert. Aktueller Arbeitsstand unverändert.';
 }catch(err){
  if(err?.code==='ARCHIVE_CONFLICT'){renderArchive();status.textContent='Archiv inzwischen geändert. Liste aktualisiert; Import bitte erneut starten.';}
  else alert('Archiv konnte nicht eingelesen werden: '+(err?.message||'ungültige Datei'));
 }
});
byId('reload-storage').addEventListener('click',()=>{
 if(!confirm('Den neuesten Browserstand laden? Nicht gespeicherte Änderungen in diesem Tab gehen verloren. Speichere sie bei Bedarf zuerst als JSON-Datei.'))return;
 const fresh=load();
 if(fresh.state==='unavailable'){
  status.textContent='Browser-Speicher nicht erreichbar. Bitte diesen Arbeitsstand als Datei sichern.';
  return;
 }
 project=fresh.project;
 history=createHistory(project);
 unsavedGuard.setDirty(false);
 storageState=fresh.state;
 expectedPrimaryRaw=fresh.primaryRaw;
 byId('reload-storage').hidden=true;
 renderAll();
 updateHistoryButtons();
 status.textContent=fresh.state==='damaged'
  ?'Browserdaten beschädigt. Nichts überschrieben. Bitte Sicherung als Datei speichern.'
  :'Aktueller Browserstand geladen. Vorherige Änderungen dieses Tabs wurden nicht übernommen.';
});
window.addEventListener('storage',event=>{
 if((event.key===PRIMARY_KEY||event.key===null)&&event.newValue!==expectedPrimaryRaw)markConflict();
 if(event.key===ARCHIVE_KEY||event.key===null)renderArchive();
});
renderAll();
renderArchive();
updateHistoryButtons();
if(initial.state==='new')save(false);
startupStatus();
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
