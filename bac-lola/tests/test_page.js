// Test de la page avec un faux DOM : node tests/test_page.js
const fs=require('fs'), vm=require('vm'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=html.match(/<script>([\s\S]*)<\/script>/); if(!m) throw new Error("script introuvable");
const els={};
const doc={getElementById:id=>els[id]||(els[id]={innerHTML:"",className:"",textContent:""})};
let intervals=[], reseauHs=false, urls=[];
// Positions simulées (publiées par le serveur) : bac à quai Basse-Indre puis traversée vers Indret
const t0=Date.parse("2026-11-17T08:00:00Z");
const pts=[[47.19744,-1.67439,0.1],[47.19744,-1.67439,0.1],[47.19744,-1.67439,0.2],[47.1969,-1.6731,3],[47.1962,-1.6724,3.2],[47.1956,-1.6728,2],[47.19534,-1.6743,0.1],[47.19534,-1.6743,0.1]];
const samples=pts.map((r,i)=>[t0+i*60000,r[0],r[1],r[2],null]);
const ctx={document:doc,
  fetch:async(u)=>{ urls.push(u); if(/open-meteo/.test(u)) return {ok:true,json:async()=>({current:{time:"2026-11-17T09:00",temperature_2m:9.6,weather_code:61,wind_speed_10m:18.2,wind_direction_10m:250}})}; if(reseauHs) throw new Error("réseau coupé"); return {ok:true,json:async()=>({maj:t0,n:samples.length,samples})}; },
  setInterval:(f,ms)=>intervals.push([f,ms]),Intl,Date,Math,JSON,console,parseFloat,isFinite,Number,Set,Array,Object,String};
vm.createContext(ctx);
let horloge=t0+8*60000; const RD=Date; ctx.Date=class extends RD{constructor(...a){super(...(a.length?a:[horloge]))} static now(){return horloge}; static UTC(...a){return RD.UTC(...a)}; static parse(s){return RD.parse(s)}};
vm.runInContext(m[1]+"\nthis.__t={rendre,lirePosition,lireMeteo,journal:()=>journal};",ctx);
(async()=>{
  await ctx.__t.lirePosition(); await ctx.__t.lirePosition(); // 2e lecture : aucune position en double
  const h=els.quais.innerHTML+els.mesures.innerHTML, b=els.bandeau.innerHTML;
  const ok=(c,msg)=>{ if(!c){ console.error("ÉCHEC :",msg); process.exitCode=1; } else console.log("ok :",msg); };
  ok(/Basse-Indre/.test(h)&&/Indret/.test(h),"deux sections quai");
  ok((h.match(/Prochain départ/g)||[]).length===2,"prochain départ affiché pour chaque quai");
  ok(/Enchaînement prévu/.test(html),"enchaînement prévu (les deux quais ensemble)");
  ok(/Derniers changements mesurés/.test(html)&&/<td class="dep">/.test(els.mesures.innerHTML)&&/<td class="arr">/.test(els.mesures.innerHTML)&&/Indret<\/th><th>Basse-Indre/.test(els.mesures.innerHTML),"derniers changements mesurés (les deux quais ensemble)");
  ok(/class="mode"/.test(b),"bandeau de mode");
  ok(ctx.__t.journal().length>=3,"événements détectés en direct : "+ctx.__t.journal().map(e=>e.type+e.q).join(","));
  ok(/class="bateau/.test(els.carte.innerHTML)&&/Indret|Basse-Indre/.test(els.carte.innerHTML),"visuel : bateau positionné entre les deux quais ("+els.carte.innerHTML.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()+")");
  await ctx.__t.lireMeteo(); ok(/10 °C · Pluie · vent 18 km\/h O/.test(els.meteo.innerHTML)&&/🌧️/.test(els.meteo.innerHTML),"météo affichée : "+els.meteo.innerHTML.replace(/<[^>]+>/g,""));
  ok(!/class="alerte"/.test(b),"pas d'alerte quand la connexion fonctionne");
  reseauHs=true; await ctx.__t.lirePosition();
  ok(/class="alerte"[^>]*>⚠ Connexion perdue/.test(els.bandeau.innerHTML),"connexion coupée : alerte « Connexion perdue » affichée");
  ok(/dernière mise à jour il y a/.test(els.bandeau.innerHTML),"l'alerte indique l'ancienneté de la dernière mise à jour");
  reseauHs=false; await ctx.__t.lirePosition();
  ok(!/Connexion perdue/.test(els.bandeau.innerHTML),"connexion rétablie : alerte retirée");
  ok(/raw\.githubusercontent\.com\/Peeksoumi\/lola-relais\/main\/positions\.json\?t=/.test(urls.filter(u=>!/open-meteo/.test(u))[0]),"la page lit le fichier public du dépôt lola-relais (avec ?t= anti-cache)");
  ok(!urls.some(u=>/peeksoumi\.com|lola-direct/.test(u)),"plus aucun appel au relais du VPS");
  const mesAvant=els.mesures.innerHTML.replace(/<small>.*?<\/small>/g,"");
  horloge+=5*60000; ctx.__t.rendre();
  ok(!/class="alerte"/.test(els.bandeau.innerHTML),"source vieille de 6 min (cadence de 5 min) : pas d'alerte");
  ok(/estimé par le modèle/.test(els.carte.innerHTML),"entre deux mises à jour : situation signalée « estimée »");
  ok(els.mesures.innerHTML.replace(/<small>.*?<\/small>/g,"")===mesAvant,"tableau des mesures : inchangé par les estimations");
  horloge+=8*60000; ctx.__t.rendre();
  ok(/Aucune nouvelle position du bac depuis 1[34] min/.test(els.bandeau.innerHTML),"position figée > 12 min : alerte de retard");
  horloge+=10*60000; ctx.__t.rendre();
  ok(/Position AIS indisponible/.test(els.bandeau.innerHTML)&&/Position trop ancienne/.test(els.carte.innerHTML),"position > 20 min : prévisions suspendues");
  ok(intervals.some(x=>x[1]===30000),"relecture toutes les 30 s");
  console.log(b.replace(/<[^>]+>/g," ").replace(/\s+/g," "));
})();
