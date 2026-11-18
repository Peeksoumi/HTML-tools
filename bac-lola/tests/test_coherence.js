// Cohérence : le visuel et les cartes de quai racontent la même situation, à chaque instant d'une rotation simulée.
// node tests/test_coherence.js
const fs=require('fs'), vm=require('vm'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const code=html.match(/<script>([\s\S]*)<\/script>/)[1];
const t0=Date.parse("2026-11-17T08:00:00Z");
const N=[47.19744,-1.67439], S=[47.19534,-1.6743];
const mid=[[47.1969,-1.6731],[47.1962,-1.6724],[47.1956,-1.6728]];
// (lat,lon,vitesse) une position par minute : quai N, traversée vers S, quai S, retour vers N, quai N
const pts=[[...N,0.1],[...N,0.1],[...N,0.2],[...mid[0],3],[...mid[1],3.2],[...mid[2],2],[...S,0.1],[...S,0.1],[...S,0.1],[...mid[2],2.5],[...mid[1],3],[...mid[0],3],[...N,0.1],[...N,0.1]];
let bad=0, vus={};
for(let n=3;n<=pts.length;n++){
  const samples=pts.slice(0,n).map((r,i)=>[t0+i*60000,r[0],r[1],r[2],null]);
  for(const dt of [20000,70000,150000]){
    const els={}, doc={getElementById:id=>els[id]||(els[id]={innerHTML:"",className:"",textContent:""})};
    let horloge=samples[n-1][0]+dt; const RD=Date;
    const D=class extends RD{constructor(...a){super(...(a.length?a:[horloge]))} static now(){return horloge}; static UTC(...a){return RD.UTC(...a)}; static parse(s){return RD.parse(s)}};
    const ctx={document:doc,fetch:async(u)=>/open-meteo/.test(u)?{ok:false}:{ok:true,json:async()=>({samples})},setInterval(){},Intl,Date:D,Math,JSON,console,parseFloat,isFinite,Number,Set,Array,Object,String};
    vm.createContext(ctx); vm.runInContext(code+"\nthis.__t={lirePosition};",ctx);
    ctx.__t.lirePosition().then(()=>{
      const c=els.carte.innerHTML.replace(/<[^>]+>/g," ").replace(/\s+/g," "), q=els.quais.innerHTML.replace(/<[^>]+>/g," ").replace(/\s+/g," ");
      const aq=c.match(/À quai à (Indret|Basse-Indre)/), rt=c.match(/En route vers (Indret|Basse-Indre)/);
      let ok=true;
      if(aq){ const ici=(q.match(/Bac à quai ici/g)||[]).length; ok=ici===1 && q.indexOf(aq[1])<q.indexOf("Bac à quai ici")+400; vus.quai=1; }
      else if(rt){ ok=/Bac parti vers/.test(q) && /Bac en approche/.test(q) && !/Bac à quai ici/.test(q); vus.transit=1; }
      else ok=/en attente|indisponible|ancienne/.test(c+q);
      if(!ok){ bad++; console.error("INCOHÉRENT n="+n+" dt="+dt+" :",c,"|",q.slice(0,300)); }
    });
  }
}
process.on('exit',()=>{ if(bad) process.exitCode=1; else console.log("ok : visuel et cartes cohérents ("+Object.keys(vus).join(" + ")+")"); });
