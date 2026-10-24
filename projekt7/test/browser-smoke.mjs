/** Chromium milestone: no npm packages, remote calls, real accounts or production data. */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const candidates=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean);
const chrome=candidates.find(bin=>spawnSync(bin,['--version'],{stdio:'ignore'}).status===0);
assert.ok(chrome,'Chrome/Chromium is required for this milestone test');
const profile=await mkdtemp(join(tmpdir(),'projekt7-browser-'));
let browser,ws,ws2,server;
let workerOverride=null;
const pending2=new Map();
const pending=new Map(),errors=[],external=[];
let nextId=0;
function send(method,params={}){
 return new Promise((resolve,reject)=>{
  const id=++nextId;
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},12000);
  pending.set(id,{resolve,reject,timer});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(result.exceptionDetails)throw new Error('Browser exception: '+(result.exceptionDetails.exception?.description||result.exceptionDetails.text));
 return result.result?.value;
}
async function until(expression,timeout=12000){
 const start=Date.now();
 while(Date.now()-start<timeout){
  try{if(await evaluate(expression))return;}catch{}
  await sleep(120);
 }
 throw new Error('Browser condition timed out: '+expression);
}
async function navigate(url){
 await evaluate('window.__smokeNavigationMarker=true');
 const result=await send('Page.navigate',{url});
 if(result.errorText)throw new Error('Navigation failed: '+result.errorText);
 await until("!window.__smokeNavigationMarker && document.readyState==='complete' && !!document.querySelector('#results .rank-item')");
}
try{
 server=createServer(async(req,res)=>{
  try{
   const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(!path.startsWith('/projekt7/')){res.writeHead(404).end();return;}
   const relative=path.slice('/projekt7/'.length)||'index.html';
   const file=resolve(root,relative);
   if(file===root||!file.startsWith(root+sep)){res.writeHead(403).end();return;}
   if(!(await stat(file)).isFile()){res.writeHead(404).end();return;}
   const ext=file.slice(file.lastIndexOf('.'));
   res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store'});
   res.end(relative==='sw.js'&&workerOverride!==null?workerOverride:await readFile(file));
  }catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const url=origin+'/projekt7/index.html';
 browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let port;
 for(let i=0;i<150;i++){
  if(browser.exitCode!==null)throw new Error('Browser terminated unexpectedly');
  try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}
  await sleep(100);
 }
 assert.ok(port,'Chrome DevTools port not found');
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const target=targets.find(t=>t.type==='page');
 assert.ok(target,'Chrome page target missing');
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{
  const msg=JSON.parse(event.data);
  if(msg.id){
   const p=pending.get(msg.id);if(!p)return;
   pending.delete(msg.id);clearTimeout(p.timer);
   msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);
  }
  if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);
  if(msg.method==='Network.requestWillBeSent'){
   const targetUrl=msg.params.request.url;
   if(/^https?:/.test(targetUrl)&&!targetUrl.startsWith(origin+'/'))external.push(targetUrl);
  }
 });
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await navigate(url);
 assert.equal(await evaluate("document.querySelectorAll('#results .rank-item').length>=2"),true);
 assert.equal(await evaluate("document.querySelector('link[rel=apple-touch-icon]').getAttribute('href')"),'./apple-touch-icon.png');
 assert.equal(await evaluate("document.querySelector('.install-help summary')!==null"),true);
 assert.equal(await evaluate("!!document.querySelector('#archive-export')&&!!document.querySelector('#archive-import')"),true);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),true,'Horizontal overflow on mobile');
 assert.equal(await evaluate("[...document.querySelectorAll('button:not(:disabled)')].filter(b=>b.getClientRects().length>0).every(b=>b.getBoundingClientRect().height>=40)"),true,'Touch targets under 40px');
 await evaluate("document.querySelector('#project-title').value='Offline-Test';document.querySelector('#project-title').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#archive-save').click()");
 await until("document.querySelectorAll('.archive-item').length===1");
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('klarpunkt.project.v1')).title"),'Offline-Test');
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('klarpunkt.archive.v1')).items[0].project.title"),'Offline-Test');
 const exported=await evaluate(`(async()=>{
  let blob=null;
  const oldCreate=URL.createObjectURL,oldClick=HTMLAnchorElement.prototype.click;
  URL.createObjectURL=value=>{blob=value;return 'blob:mock';};
  HTMLAnchorElement.prototype.click=function(){window.__backupName=this.download;};
  try{document.querySelector('#export').click();window.__exportedBackup=await blob.text();return window.__exportedBackup;}
  finally{URL.createObjectURL=oldCreate;HTMLAnchorElement.prototype.click=oldClick;}
 })()`);
 assert.equal(JSON.parse(exported).title,'Offline-Test','UI export content incorrect');
 assert.equal(await evaluate("window.__backupName.endsWith('.json')"),true);
 await evaluate("window.confirm=()=>true;document.querySelector('#new-project').click()");
 await until("document.querySelector('#project-title').value==='Meine Entscheidung'");
 await evaluate(`(()=>{
  const file=new File([window.__exportedBackup],'restore.json',{type:'application/json'});
  const transfer=new DataTransfer();transfer.items.add(file);
  const input=document.querySelector('#import-file');input.files=transfer.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));
 })()`);
 await until("document.querySelector('#project-title').value==='Offline-Test'");
 await evaluate("document.querySelector('#new-project').click()");
 await until("document.querySelector('#project-title').value==='Meine Entscheidung'");
 await evaluate("document.querySelector('.archive-actions button').click()");
 await until("document.querySelector('#project-title').value==='Offline-Test'");
 const conflict=await evaluate(`(()=>{
  const key='klarpunkt.project.v1',before=localStorage.getItem(key);
  const remote={...JSON.parse(before),title:'Parallel-Tab'};
  const raw=JSON.stringify(remote);
  localStorage.setItem(key,raw);
  dispatchEvent(new StorageEvent('storage',{key,oldValue:before,newValue:raw,storageArea:localStorage,url:location.href}));
  const field=document.querySelector('#project-title');field.value='Lokale Änderung';
  field.dispatchEvent(new Event('input',{bubbles:true}));
  return {persisted:JSON.parse(localStorage.getItem(key)).title,reloadVisible:!document.querySelector('#reload-storage').hidden};
 })()`);
 assert.deepEqual(conflict,{persisted:'Parallel-Tab',reloadVisible:true},'Concurrent tab must not be overwritten');
 await evaluate("window.confirm=()=>true;document.querySelector('#reload-storage').click()");
 await until("document.querySelector('#project-title').value==='Parallel-Tab'");
 assert.equal(await evaluate("document.querySelector('#reload-storage').hidden"),true);

 // Two genuine Chrome tabs: verify native storage events and independent editors.
 const newTab=await send('Target.createTarget',{url});
 const allTargets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const tabTarget=allTargets.find(t=>t.id===newTab.targetId);
 assert.ok(tabTarget,'Second Chrome tab missing');
 ws2=new WebSocket(tabTarget.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws2.addEventListener('open',resolve,{once:true});ws2.addEventListener('error',reject,{once:true});});
 let next2=0;
 function send2(method,params={}){
  return new Promise((resolve,reject)=>{
   const id=++next2,timer=setTimeout(()=>{pending2.delete(id);reject(new Error('Second tab timeout: '+method));},12000);
   pending2.set(id,{resolve,reject,timer});ws2.send(JSON.stringify({id,method,params}));
  });
 }
 ws2.addEventListener('message',event=>{
  const msg=JSON.parse(event.data);
  if(msg.id){
   const p=pending2.get(msg.id);if(!p)return;
   pending2.delete(msg.id);clearTimeout(p.timer);
   msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);
  }
  if(msg.method==='Runtime.exceptionThrown')errors.push('Second tab: '+msg.params.exceptionDetails.text);
 });
 await send2('Runtime.enable');
 async function eval2(expression){
  const result=await send2('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw new Error('Second tab exception: '+result.exceptionDetails.text);
  return result.result?.value;
 }
 async function wait2(expression){
  const started=Date.now();
  while(Date.now()-started<12000){try{if(await eval2(expression))return;}catch{}await sleep(120);}
  throw new Error('Second tab timed out: '+expression);
 }
 await wait2("document.readyState==='complete' && !!document.querySelector('#results .rank-item')");
 await eval2("document.querySelector('#project-title').value='Echter Zweittab';document.querySelector('#project-title').dispatchEvent(new Event('input',{bubbles:true}))");
 await until("!document.querySelector('#reload-storage').hidden");
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('klarpunkt.project.v1')).title"),'Echter Zweittab');
 await evaluate("document.querySelector('#project-title').value='Veralteter Ersttab';document.querySelector('#project-title').dispatchEvent(new Event('input',{bubbles:true}))");
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('klarpunkt.project.v1')).title"),'Echter Zweittab','Concurrent write lost data');
 await evaluate("window.confirm=()=>true;document.querySelector('#reload-storage').click()");
 await until("document.querySelector('#project-title').value==='Echter Zweittab'");
 await evaluate("document.querySelector('#project-title').value='Ersttab neu';document.querySelector('#project-title').dispatchEvent(new Event('input',{bubbles:true}))");
 await wait2("!document.querySelector('#reload-storage').hidden");
 await eval2("document.querySelector('#project-title').value='Veralteter Zweittab';document.querySelector('#project-title').dispatchEvent(new Event('input',{bubbles:true}))");
 assert.equal(await eval2("JSON.parse(localStorage.getItem('klarpunkt.project.v1')).title"),'Ersttab neu');
 await eval2("window.confirm=()=>true;document.querySelector('#reload-storage').click()");
 await wait2("document.querySelector('#project-title').value==='Ersttab neu'");
 await eval2("document.querySelector('#archive-save').click()");
 await until("document.querySelectorAll('.archive-item').length===2");
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('klarpunkt.archive.v1')).items.length"),2);
 await send('Target.closeTarget',{targetId:newTab.targetId});
 ws2.close();ws2=null;
 await until("navigator.serviceWorker && navigator.serviceWorker.ready.then(()=>true)");
 await navigate(url);
 await until('!!navigator.serviceWorker.controller');
 await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await navigate(url);
 assert.equal(await evaluate("document.querySelector('#project-title').value"),'Ersttab neu','Offline persistence broken');
 assert.equal(await evaluate("document.querySelectorAll('#results .rank-item').length>=2"),true,'Offline module loading broken');

 // Simulate a deployment and verify the new shell survives a cold offline reload.
 await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 const sourceWorker=await readFile(join(root,'sw.js'),'utf8');
 workerOverride=sourceWorker.replace("'klarpunkt-shell-v9'","'klarpunkt-shell-v9-smoke'");
 assert.notEqual(workerOverride,sourceWorker,'Worker version marker missing');
 await evaluate("navigator.serviceWorker.ready.then(reg=>reg.update().then(()=>true))");
 await until("caches.keys().then(keys=>keys.includes('klarpunkt-shell-v9-smoke')&&!keys.includes('klarpunkt-shell-v9'))");
 await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await navigate(url);
 assert.equal(await evaluate("document.querySelector('#project-title').value"),'Ersttab neu','Offline update lost local state');
 assert.equal(await evaluate("document.querySelectorAll('#results .rank-item').length>=2"),true,'Offline update missing app modules');
 assert.deepEqual(errors,[],'Uncaught browser exceptions');
 assert.deepEqual(external,[],'Unexpected external HTTP requests');
 console.log('Browser milestone PASS: mobile, touch, backup, genuine multi-tab, archive sync, offline upgrade, JS exceptions, external requests');
}finally{
 for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Closing'));}pending.clear();
 for(const p of pending2.values()){clearTimeout(p.timer);p.reject(new Error('Closing'));}pending2.clear();
 if(ws2)ws2.close();
 if(ws)ws.close();
 if(browser){browser.kill('SIGTERM');await sleep(150);if(browser.exitCode===null)browser.kill('SIGKILL');}
 if(server)await new Promise(resolve=>server.close(resolve));
 await rm(profile,{recursive:true,force:true});
}
