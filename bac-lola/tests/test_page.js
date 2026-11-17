// Test de la page avec un faux DOM : node tests/test_page.js
const fs=require('fs'), vm=require('vm'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=html.match(/<script>([\s\S]*)<\/script>/); if(!m) throw new Error("script introuvable");
const els={}, store={};
const doc={getElementById:id=>els[id]||(els[id]={innerHTML:"",className:"",textContent:""})};
let intervals=[];
// Relevés simulés : bac à quai Basse-Indre puis traversée vers Indret
let k=0; const t0=Date.parse("2026-11-17T08:00:00Z");
const suite=[[47.19744,-1.67439,0.1],[47.19744,-1.67439,0.1],[47.19744,-1.67439,0.2],[47.1969,-1.6731,3],[47.1962,-1.6724,3.2],[47.1956,-1.6728,2],[47.19534,-1.6743,0.1],[47.19534,-1.6743,0.1]];
const ctx={document:doc,localStorage:{getItem:c=>store[c]||null,setItem:(c,v)=>{store[c]=v}},
  fetch:async()=>{const r=suite[Math.min(k++,suite.length-1)];return{ok:true,text:async()=>r.join(" ")}},
  setInterval:(f,ms)=>intervals.push([f,ms]),Intl,Date,Math,JSON,console,parseFloat,isFinite,Number,Set,Array,Object,String};
vm.createContext(ctx);
let horloge=t0; const RD=Date; ctx.Date=class extends RD{constructor(...a){super(...(a.length?a:[horloge]))} static now(){return horloge}; static UTC(...a){return RD.UTC(...a)}; static parse(s){return RD.parse(s)}};
vm.runInContext(m[1]+"\nthis.__t={rendre,lirePosition,journal:()=>journal};",ctx);
(async()=>{
  for(let i=0;i<suite.length;i++){ horloge+=10000; await ctx.__t.lirePosition(); }
  const h=els.quais.innerHTML, b=els.bandeau.innerHTML;
  const ok=(c,msg)=>{ if(!c){ console.error("ÉCHEC :",msg); process.exitCode=1; } else console.log("ok :",msg); };
  ok(/Basse-Indre/.test(h)&&/Indret/.test(h),"deux sections quai");
  ok((h.match(/class="sit( actif)?"/g)||[]).length===8,"4 situations par quai");
  ok((h.match(/Prochains changements/g)||[]).length===2,"prochains changements pour chaque quai");
  ok(/Derniers changements mesurés/.test(h),"derniers changements mesurés");
  ok(/class="mode"/.test(b),"bandeau de mode");
  ok(ctx.__t.journal().some(e=>!e.seed),"événements détectés en direct : "+ctx.__t.journal().filter(e=>!e.seed).map(e=>e.type+e.q).join(","));
  console.log(b.replace(/<[^>]+>/g," ").replace(/\s+/g," "));
})();
