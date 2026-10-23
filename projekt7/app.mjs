import {starterProject,blankProject,validateProject,evaluate,MAX_OPTIONS,MAX_CRITERIA} from './core.mjs';
import {inspectStorage,saveProject} from './storage.mjs';
import {createHistory} from './history.mjs';

const byId=id=>document.getElementById(id);
const status=byId('save-status');
const make=(tag,className='',text='')=>{
 const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;
};
const labelFor=(input,text)=>{
 const l=make('label','field-label',text);l.htmlFor=input.id;return l;
};
const initial=load();
let project=initial.project;
const history=createHistory(project);
let storageState=initial.state;
let idCounter=0;

function load(){
 try{return inspectStorage(window.localStorage);}
 catch{return inspectStorage(null);}
}
function updateHistoryButtons(){byId('undo').disabled=!history.canUndo();byId('redo').disabled=!history.canRedo();}
function save(record=true){
 if(record)history.push(project);
 updateHistoryButtons();
 if(storageState==='damaged'){
  status.textContent='Gespeicherte Daten beschädigt. Nichts überschrieben – bitte zuerst eine Sicherung herunterladen oder bewusst neu beginnen.';
  return false;
 }
 try{
  saveProject(window.localStorage,project,storageState==='recovered');
  storageState='ok';
  status.textContent='Automatisch gespeichert · nur auf diesem Gerät';
  return true;
 }catch(err){
  status.textContent='Speichern im Browser nicht möglich – bitte Sicherung herunterladen.';
  return false;
 }
}
function replaceDamagedStorage(){
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
  },'Möglichkeit '+(index+1)+' entfernen');
  remove.disabled=project.options.length<=2;
  row.append(remove);root.append(row);
 });
 byId('add-option').disabled=project.options.length>=MAX_OPTIONS;
}
function addSlider(parent,{title,min,max,value,onChange,step=1,format=x=>String(x),id}){
 const box=make('div','range-control');
 const label=make('label');label.htmlFor=id;
 const titleSpan=make('span','',title);const output=make('output','',format(value));
 output.htmlFor=id;label.append(titleSpan,output);
 const input=make('input');input.type='range';input.id=id;input.min=String(min);input.max=String(max);
 input.step=String(step);input.value=String(value);
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
  },'Kriterium '+(criterionIndex+1)+' entfernen');
  remove.disabled=project.criteria.length<=1;heading.append(input,remove);
  card.append(heading);
  const settings=make('div','control-row');
  addSlider(settings,{
   title:'Wichtigkeit',min:1,max:5,value:criterion.weight,
   id:'weight-'+criterion.id,onChange:v=>{criterion.weight=v;},
   format:v=>v+'/5'
  });
  addSlider(settings,{
   title:'Unsicherheit',min:0,max:3,value:criterion.uncertainty,
   id:'uncertainty-'+criterion.id,onChange:v=>{criterion.uncertainty=v;},
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
}
function renderAll(){
 byId('project-title').value=project.title;
 renderOptions();renderCriteria();renderResults();
}
function changed(){save();renderAll();}
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
});
byId('add-criterion').addEventListener('click',()=>{
 if(project.criteria.length>=MAX_CRITERIA)return;
 const ratings=Object.fromEntries(project.options.map(o=>[o.id,5]));
 project.criteria.push({id:uniqueId('c',project.criteria),name:'Neues Kriterium',weight:3,uncertainty:1,ratings});
 changed();
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
  const data=JSON.stringify(validateProject(project),null,2);
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
 if(file.size>100000){alert('Datei zu groß (maximal 100 KB).');return;}
 try{
  const input=validateProject(JSON.parse(await file.text()));
  if(!confirm('Aktuelle Entscheidung durch diese Sicherung ersetzen?'))return;
  if(!replaceDamagedStorage())return;
  project=input;
  changed();
  if(storageState==='ok')status.textContent='Sicherung erfolgreich eingelesen · lokal gespeichert';
 }catch(err){alert('Sicherung konnte nicht geöffnet werden: '+(err?.message||'ungültige Datei'));}
});
renderAll();
updateHistoryButtons();
if(initial.state==='new')save(false);
startupStatus();
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
