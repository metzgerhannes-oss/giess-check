/**
 * Pure, dependency-free decision engine. No network, accounts, or analytics.
 * All calculations happen on the user's device.
 */
export const MAX_OPTIONS=6;
export const MAX_CRITERIA=9;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number.isFinite(Number(value))?Number(value):min));
const clean=(v,max=80)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
const makeOption=(id,name)=>({id,name});
const makeCriterion=(id,name,weight=3,uncertainty=1,ratings={})=>({id,name,weight,uncertainty,ratings});

export function starterProject(){
 return {
  version:1, title:"Welcher Wochenendplan passt am besten?", 
  options:[makeOption("o1","Städtetrip"),makeOption("o2","Naturausflug"),makeOption("o3","Zuhause entspannen")],
  criteria:[
   makeCriterion("c1","Erholung",5,1,{o1:5,o2:8,o3:10}),
   makeCriterion("c2","Kosten",4,1,{o1:3,o2:8,o3:10}),
   makeCriterion("c3","Abwechslung",3,2,{o1:10,o2:8,o3:3}),
   makeCriterion("c4","Aufwand",3,1,{o1:3,o2:7,o3:10})
  ]
 };
}
export function blankProject(){
 return {
  version:1,title:"Meine Entscheidung",
  options:[makeOption("o1","Möglichkeit A"),makeOption("o2","Möglichkeit B")],
  criteria:[makeCriterion("c1","Was mir wichtig ist",3,1,{o1:5,o2:5}),makeCriterion("c2","Ein weiteres Kriterium",3,1,{o1:5,o2:5})]
 };
}
export function validateProject(raw){
 if(!raw || typeof raw!=="object" || Array.isArray(raw)) throw new Error("Ungültiges Dateiformat.");
 if(raw.version!==1 || !Array.isArray(raw.options) || !Array.isArray(raw.criteria)) throw new Error("Unbekanntes Projektformat.");
 if(raw.options.length<2 || raw.options.length>MAX_OPTIONS || raw.criteria.length<1 || raw.criteria.length>MAX_CRITERIA) throw new Error("Unzulässige Anzahl an Möglichkeiten oder Kriterien.");
 const optionIds=new Set(), criterionIds=new Set();
 const options=raw.options.map((o,i)=>{
  if(!o || typeof o!=="object" || typeof o.id!=="string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(o.id) || optionIds.has(o.id)) throw new Error("Ungültige Möglichkeiten.");
  optionIds.add(o.id);return {id:o.id,name:clean(o.name)||`Möglichkeit ${i+1}`};
 });
 const criteria=raw.criteria.map((c,i)=>{
  if(!c || typeof c!=="object" || typeof c.id!=="string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(c.id) || criterionIds.has(c.id)) throw new Error("Ungültige Kriterien.");
  criterionIds.add(c.id);
  const ratings={};
  for(const option of options) ratings[option.id]=clamp(c.ratings?.[option.id],0,10);
  return {id:c.id,name:clean(c.name)||`Kriterium ${i+1}`,weight:Math.round(clamp(c.weight,1,5)),uncertainty:Math.round(clamp(c.uncertainty,0,3)),ratings};
 });
 return {version:1,title:clean(raw.title,120)||"Meine Entscheidung",options,criteria};
}
export function scoreProject(project){
 const p=validateProject(project);
 const weightSum=p.criteria.reduce((sum,c)=>sum+c.weight,0);
 return p.options.map(o=>{
  const score=p.criteria.reduce((sum,c)=>sum+c.weight*c.ratings[o.id],0)/weightSum;
  return {id:o.id,name:o.name,score};
 }).sort((a,b)=>b.score-a.score || p.options.findIndex(o=>o.id===a.id)-p.options.findIndex(o=>o.id===b.id));
}
function seededRandom(project){
 const raw=JSON.stringify(project);let state=2166136261;
 for(let i=0;i<raw.length;i++){state^=raw.charCodeAt(i);state=Math.imul(state,16777619);}
 return ()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
/**
 * Stress test: perturb each criterion weight by up to ±20% and each rating
 * by up to ±uncertainty points (uniformly). This is a heuristic sensitivity
 * analysis, NOT a statistical or predictive probability.
 */
export function evaluate(project,iterations=700){
 const p=validateProject(project);
 const ranked=scoreProject(p);
 const counts=Object.fromEntries(p.options.map(o=>[o.id,0]));
 const rand=seededRandom(p),steps=Math.round(clamp(iterations,1,5000));
 for(let n=0;n<steps;n++){
  const totals=Object.fromEntries(p.options.map(o=>[o.id,0]));
  let weightTotal=0;
  for(const c of p.criteria){
   const w=c.weight*(0.8+0.4*rand());weightTotal+=w;
   for(const o of p.options){
    const noisy=clamp(c.ratings[o.id]+(rand()*2-1)*c.uncertainty,0,10);
    totals[o.id]+=noisy*w;
   }
  }
  const top=Math.max(...Object.values(totals).map(v=>v/weightTotal));
  const winners=p.options.filter(o=>Math.abs(totals[o.id]/weightTotal-top)<1e-9);
  winners.forEach(o=>{counts[o.id]+=1/winners.length;});
 }
 const detailed=ranked.map(o=>({...o,stability:Math.round(100*counts[o.id]/steps)}));
 const best=detailed[0],runner=detailed[1],weightSum=p.criteria.reduce((sum,c)=>sum+c.weight,0);
 const drivers=p.criteria.map(c=>({
  name:c.name,delta:(c.ratings[best.id]-c.ratings[runner.id])*c.weight/weightSum
 })).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
 const margin=best.score-runner.score;
 return {ranked:detailed,best,runner,margin,drivers,stable:best.stability>=75,iterations:steps};
}
