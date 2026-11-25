// Test de la page avec un faux DOM : node tests/test_page.js
const fs=require('fs'), vm=require('vm'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=[null,html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>"))]; if(!m) throw new Error("script introuvable");
const els={};
const doc={getElementById:id=>els[id]||(els[id]={innerHTML:"",className:"",textContent:""})};
let intervals=[], reseauHs=false, urls=[], majFige=0, apiRefuse=false;
// Positions simulées (publiées par le serveur) : bac à quai Basse-Indre puis traversée vers Indret
const t0=Date.parse("2026-11-17T08:00:00Z");
const pts=[[47.19744,-1.67439,0.1],[47.19744,-1.67439,0.1],[47.19744,-1.67439,0.2],[47.1969,-1.6731,3],[47.1962,-1.6724,3.2],[47.1956,-1.6728,2],[47.19534,-1.6743,0.1],[47.19534,-1.6743,0.1]];
let samples=pts.map((r,i)=>[t0+i*60000,r[0],r[1],r[2],null]);
const ctx={document:doc,
  fetch:async(u)=>{ urls.push(u); if(/open-meteo/.test(u)) return {ok:true,json:async()=>({current:{time:"2026-11-17T09:00",temperature_2m:9.6,weather_code:61,wind_speed_10m:18.2,wind_direction_10m:250}})}; if(reseauHs) throw new Error("réseau coupé"); if(apiRefuse&&/api\.github\.com/.test(u)) return {ok:false,status:403}; return {ok:true,json:async()=>({maj:majFige||horloge,n:samples.length,samples})}; },
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
  ok(/Relais GitHub · position AIS/.test(els.bandeau.innerHTML),"libellé « Relais GitHub »");
  ok(urls.some(u=>/api\.github\.com\/repos\/Peeksoumi\/lola-relais\/contents\/positions\.json/.test(u))&&!urls.some(u=>/lola-direct/.test(u)),"lecture du seul fichier GitHub via l'API (sans cache CDN), plus de relais direct");
  ok(intervals.some(x=>x[1]===15000),"tick toutes les 15 s, lecture GitHub limitée à une toutes les 30 s");
  const nb=urls.filter(u=>/lola-relais/.test(u)).length;
  horloge+=10000; await ctx.__t.lirePosition();
  ok(urls.filter(u=>/lola-relais/.test(u)).length===nb,"deux lectures à moins de 30 s : une seule requête GitHub");
  const mesAvant=els.mesures.innerHTML.replace(/<small>.*?<\/small>/g,"");
  // position figée : seuil d'alerte de 5 min
  horloge+=3*60000; await ctx.__t.lirePosition();
  ok(!/class="alerte"/.test(els.bandeau.innerHTML),"position de ~4 min 10 s (aisstream muet à quai, repli en cours) : pas d'alerte");
  horloge+=2*60000; await ctx.__t.lirePosition();
  ok(/Aucune nouvelle position du bac depuis \d+ min/.test(els.bandeau.innerHTML),"position figée > 5 min : alerte de retard");
  ok(/hypothèse du modèle/.test(els.carte.innerHTML)&&/\(supposé\)/.test(els.carte.innerHTML),"position ancienne : situation signalée « hypothèse du modèle » / « (supposé) »");
  ok(els.mesures.innerHTML.replace(/<small>.*?<\/small>/g,"")===mesAvant,"tableau des mesures : inchangé par les estimations");
  // GitHub injoignable
  reseauHs=true; horloge+=80000; await ctx.__t.lirePosition();
  ok(/class="alerte"[^>]*>⚠ Connexion perdue/.test(els.bandeau.innerHTML),"GitHub coupé : alerte « Connexion perdue »");
  ok(/dernière mise à jour il y a/.test(els.bandeau.innerHTML),"l'alerte indique l'ancienneté de la dernière mise à jour");
  reseauHs=false; horloge+=700000; await ctx.__t.lirePosition();
  ok(!/Connexion perdue/.test(els.bandeau.innerHTML),"connexion rétablie : alerte retirée");
  horloge+=20*60000; await ctx.__t.lirePosition();
  ok(/Position AIS indisponible/.test(els.bandeau.innerHTML)&&/Position trop ancienne/.test(els.carte.innerHTML),"position figée > 10 min : prévisions suspendues");
  // --- états : mesuré / hypothèse / indisponible, deux seuils selon la vitesse, nuit, hors chenal ---
  const T=x=>Date.parse(x), led=/<span class="led"><\/span>Relais GitHub/;
  // nuit : une position ancienne est normale (le bac n'émet plus)
  horloge=T("2026-11-18T02:00:00Z"); await ctx.__t.lirePosition();
  ok(/Hors service/.test(els.bandeau.innerHTML)&&!/indisponible/.test(els.bandeau.innerHTML)&&!/class="alerte"/.test(els.bandeau.innerHTML),"nuit, position ancienne : « Hors service », ni « indisponible » ni alerte");
  // en service, à quai, position fraîche (1 min) : mesure, aucune estimation
  const J=T("2026-11-18T08:00:00Z"), pos=(dt,lat,lon,v)=>[J+dt,lat,lon,v,null], IND=[47.19534,-1.6743];
  samples=[pos(-420000,47.1962,-1.6724,3.2),pos(-360000,47.1956,-1.6728,2.0),pos(-300000,IND[0],IND[1],0.1),pos(-240000,IND[0],IND[1],0.1),pos(-60000,IND[0],IND[1],0.1)]; // traversée puis arrivée à Indret
  horloge=J; await ctx.__t.lirePosition();
  ok(led.test(els.bandeau.innerHTML)&&!/hypothèse|supposé/.test(els.carte.innerHTML)&&!/quai hypo/.test(els.quais.innerHTML),"à quai, position < 4 min : mesure (point vert plein), aucune mention d'hypothèse");
  ok(!/class="alerte"/.test(els.bandeau.innerHTML)&&!/dernier état connu/.test(els.bandeau.innerHTML),"position fraîche : titre du mode plein, pas d'alerte");
  // à quai, 4 min 20 s : hypothèse sans alerte (l'AIS n'émet qu'une position / 3 min à quai)
  horloge=J+200000; await ctx.__t.lirePosition();
  ok(/<span class="led creux">/.test(els.bandeau.innerHTML)&&/quai hypo/.test(els.quais.innerHTML)&&/hypothèse du modèle/.test(els.carte.innerHTML)&&/dernier état connu/.test(els.bandeau.innerHTML)&&!/class="alerte"/.test(els.bandeau.innerHTML),"à quai, 4 min 20 s : point creux, quai en pointillé, titre « dernier état connu », sans alerte");
  ok(/class="badge">~ à quai \?<\/div>/.test(els.quais.innerHTML)||/class="badge">~ en approche \?<\/div>/.test(els.quais.innerHTML),"badge « ~ … ? » sur le quai en hypothèse");
  horloge=J+250000; await ctx.__t.lirePosition();
  ok(/Aucune nouvelle position du bac depuis 5 min/.test(els.bandeau.innerHTML),"à quai : alerte rouge à partir de 5 min");
  // en mouvement : mesure < 2 min, alerte rouge à 3 min
  samples=samples.concat([pos(500000,47.1962,-1.6724,3.0)]);
  horloge=J+520000; await ctx.__t.lirePosition();
  ok(led.test(els.bandeau.innerHTML)&&!/class="alerte"/.test(els.bandeau.innerHTML),"en mouvement, position de 20 s : mesure, pas d'alerte");
  horloge=J+500000+90000; await ctx.__t.lirePosition();
  ok(led.test(els.bandeau.innerHTML)&&!/class="alerte"/.test(els.bandeau.innerHTML),"en mouvement, position de 90 s : encore une mesure, pas d'alerte (cadence réelle 30-130 s)");
  horloge=J+500000+200000; await ctx.__t.lirePosition();
  ok(/Aucune nouvelle position du bac depuis 3 min/.test(els.bandeau.innerHTML)&&/<span class="led creux">/.test(els.bandeau.innerHTML),"en mouvement, 200 s sans position : alerte rouge et hypothèse (à quai, la même ancienneté ne déclenche rien)");
  // hors du chenal : position reçue mais situation non confirmée
  samples=samples.concat([pos(780000,47.2100,-1.6000,0.1)]);
  horloge=J+800000; await ctx.__t.lirePosition();
  ok(/hors du chenal/.test(els.bandeau.innerHTML)&&/hors du chenal/.test(els.carte.innerHTML)&&/hypothèse du modèle/.test(els.carte.innerHTML),"position hors du chenal : signalée, situation en hypothèse");
  // plus de 10 min en service : indisponible
  horloge=J+800000+11*60000; await ctx.__t.lirePosition();
  ok(/Position AIS indisponible/.test(els.bandeau.innerHTML)&&/<span class="led off">/.test(els.bandeau.innerHTML),"en service, > 10 min : « indisponible », point rouge");
  ok((els.quais.innerHTML.match(/href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;travelmode=driving&amp;destination=47\.19\d+,-1\.67\d+" target="_blank" rel="noopener">🧭 Itinéraire/g)||[]).length===2&&/destination=47\.1953/.test(els.quais.innerHTML)&&/destination=47\.1974/.test(els.quais.innerHTML),"un bouton « Itinéraire » Google Maps par quai (Indret au sud, Basse-Indre au nord)");
  // quota de l'API GitHub épuisé (403) : repli immédiat sur raw, sans alerte de connexion
  apiRefuse=true; horloge+=80000; urls.length=0; await ctx.__t.lirePosition();
  ok(urls.some(u=>/api\.github\.com/.test(u))&&urls.some(u=>/raw\.githubusercontent\.com/.test(u))&&!/Connexion perdue/.test(els.bandeau.innerHTML),"API refusée : repli sur raw, pas d'alerte de connexion");
  horloge+=40000; urls.length=0; await ctx.__t.lirePosition();
  ok(!urls.some(u=>/api\.github\.com/.test(u))&&urls.some(u=>/raw\.githubusercontent\.com/.test(u)),"pendant la pause, l'API n'est pas réinterrogée (raw toutes les 30 s)");
  apiRefuse=false; horloge+=11*60000; urls.length=0; await ctx.__t.lirePosition();
  ok(urls.some(u=>/api\.github\.com/.test(u)),"après 10 min, l'API est réessayée");
  // relais arrêté (aucune publication depuis 4 min) alors que la position date de 2 min : « Relais muet », pas une simple hypothèse
  horloge+=80000; samples=[pos(horloge-J-120000,IND[0],IND[1],0.1)]; majFige=horloge-300000;
  await ctx.__t.lirePosition();
  ok(/Le relais ne publie plus depuis 5 min/.test(els.bandeau.innerHTML)&&!/Position AIS indisponible/.test(els.bandeau.innerHTML)&&/<span class="led creux">/.test(els.bandeau.innerHTML),"relais sans publication depuis > 4 min : avertissement, situation en hypothèse (pas d'indisponibilité)");
  majFige=0; horloge+=80000; await ctx.__t.lirePosition();
  ok(!/Le relais ne publie plus/.test(els.bandeau.innerHTML),"le relais republie : avertissement retiré");
  console.log(b.replace(/<[^>]+>/g," ").replace(/\s+/g," "));
})();
