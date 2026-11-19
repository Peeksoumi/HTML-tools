// Rejeu de positions RÉELLES du relais (19/11/2026, heures UTC) : node tests/test_rejeu_traversee.js
// Régression : après la dernière position (14:24:09, 0,0 nd, au quai de Basse-Indre), la page doit dire « à quai », pas « en route / en approche ».
const fs=require('fs'), vm=require('vm'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=html.match(/<script>([\s\S]*)<\/script>/);
const els={}; const doc={getElementById:id=>els[id]||(els[id]={innerHTML:"",className:"",textContent:""})};
const T=h=>Date.parse("2026-11-19T"+h+"Z");
const reels=[["14:09:43",47.19741,-1.67433,0.0],["14:11:19",47.19743,-1.67448,1.2],["14:12:07",47.19722,-1.67564,3.3],["14:13:24",47.19617,-1.67575,2.6],
  ["14:14:41",47.19580,-1.67568,0.0],["14:15:51",47.19581,-1.67568,0.0],["14:16:52",47.19580,-1.67565,0.0],["14:18:10",47.19582,-1.67560,0.0],
  ["14:19:12",47.19580,-1.67565,0.0],["14:20:04",47.19579,-1.67565,0.0],["14:21:33",47.19580,-1.67563,0.4],["14:22:43",47.19706,-1.67527,4.6],["14:24:09",47.19744,-1.67440,0.0]];
let samples=[];
let horloge=T("14:25:40");
const ctx={document:doc,fetch:async(u)=>{ if(/open-meteo/.test(u)) return {ok:true,json:async()=>({current:{time:"2026-11-19T15:00",temperature_2m:13,weather_code:3,wind_speed_10m:29,wind_direction_10m:270}})};
    return {ok:true,json:async()=>({maj:horloge,n:samples.length,samples})}; },
  setInterval:()=>0,Intl,Date,Math,JSON,console,parseFloat,isFinite,Number,Set,Array,Object,String};
vm.createContext(ctx);
const RD=Date; ctx.Date=class extends RD{constructor(...a){super(...(a.length?a:[horloge]))} static now(){return horloge}; static UTC(...a){return RD.UTC(...a)}; static parse(s){return RD.parse(s)}};
vm.runInContext(m[1]+"\nthis.__t={rendre,lirePosition,journal:()=>journal};",ctx);
const txt=h=>h.replace(/<[^>]+>/g," ").replace(/\s+/g," ");
(async()=>{
  const ok=(c,msg)=>{ if(!c){ console.error("ÉCHEC :",msg); process.exitCode=1; } else console.log("ok :",msg); };
  samples=reels.map(r=>[T(r[0]),r[1],r[2],r[3],null]);
  await ctx.__t.lirePosition();
  const evs=ctx.__t.journal().map(e=>e.type+e.q+"@"+new Date(e.t).toISOString().slice(11,19));
  ok(/arr.*N/.test(ctx.__t.journal().filter(e=>e.t>=T("14:22:00")).map(e=>e.type+e.q).join(",")),"arrivée à Basse-Indre détectée dès la 1re position à l'arrêt ("+evs.slice(-3)+")");
  const carte=txt(els.carte.innerHTML), quais=txt(els.quais.innerHTML);
  ok(/À quai à Basse-Indre/.test(carte)&&!/En route vers/.test(carte),"carte : « À quai à Basse-Indre » (et non « en route ») : "+carte);
  ok(!/en approche/i.test(quais),"aucun quai « en approche »");
  ok(/class="led"/.test(els.bandeau.innerHTML),"position de 90 s à quai : mesure (point vert plein)");
})();
