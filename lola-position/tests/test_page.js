// Test de la page avec un faux DOM : node tests/test_page.js
const fs=require('fs'), vm=require('vm'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=html.match(/<script>([\s\S]*)<\/script>/); if(!m) throw new Error("script introuvable");

const noop=()=>{};
const ctx2d=new Proxy({},{get:(t,k)=>k in t?t[k]:noop,set:(t,k,v)=>{t[k]=v;return true;}});
const els={};
const doc={
  getElementById:id=>els[id]||(els[id]={textContent:"",className:"",width:0,height:0,getContext:()=>ctx2d,getBoundingClientRect:()=>({width:400,height:300})}),
  addEventListener:noop, visibilityState:"visible"
};

const T0=Date.parse("2026-11-19T08:40:00Z");
let horloge=T0, urls=[];
const RD=Date;
const FauxDate=class extends RD{constructor(...a){super(...(a.length?a:[horloge]))} static now(){return horloge} static parse(s){return RD.parse(s)}};

// Réponse simulée du worker ; hs = réseau coupé, status = code HTTP, illisible = corps non JSON
const rep={json:{connexion:"connecté",releve:null}};
const ctx={
  document:doc, navigator:{}, window:{devicePixelRatio:1},
  ResizeObserver:class{observe(){}}, requestAnimationFrame:noop,
  setInterval:noop, setTimeout, clearTimeout, AbortController, Intl, Date:FauxDate, Math, JSON, console, parseFloat, isFinite, Number, Object, Array, String,
  fetch:async(u)=>{ urls.push(u); if(rep.hs) throw new Error("réseau coupé");
    return {ok:(rep.status||200)<400,status:rep.status||200,json:async()=>{ if(rep.illisible) throw new Error("x"); return rep.json; }}; }
};
vm.createContext(ctx);
vm.runInContext(m[1]+"\nthis.__t={etat,src,interroger,declencher,extrapoler,majTextes,releveDuWorker};",ctx);

const ok=(c,msg)=>{ if(!c){ console.error("ÉCHEC :",msg); process.exitCode=1; } else console.log("ok :",msg); };
const attendre=()=>new Promise(r=>setTimeout(r,20));
const releve=(ageS,lat,vit,cap)=>({connexion:"connecté",releve:{lat:lat,lon:-1.6725,vitesseNoeuds:vit,capDegres:cap,heureUtc:new Date(T0-ageS*1000).toISOString(),ageSecondes:ageS}});

(async()=>{
  const t=ctx.__t;
  await attendre(); // lecture lancée au démarrage de la page

  // --- aucune donnée reçue par le worker ---
  t.majTextes(horloge);
  ok(urls.length>=1 && urls.every(u=>/lola-ais\.[^/]+\.workers\.dev\/\?format=json$/.test(u)),"une seule source interrogée : le worker AIS, en JSON ("+urls[0]+")");
  ok(els.statut.className==="warn" && /En attente du premier relevé aisstream\.io \(connexion : connecté\)/.test(els.statutTexte.textContent),"worker connecté sans relevé : attente signalée avec l'état de connexion");
  ok(/◌ Worker AIS : aucun relevé/.test(els.sources.textContent),"ligne de source : aucun relevé");

  // --- premier relevé ---
  rep.json=releve(30,47.1969,3.0,95);
  await t.interroger(); t.majTextes(horloge);
  ok(t.etat.fix.lat===47.1969 && t.etat.fix.vit===3 && t.etat.fix.cap===95,"relevé du worker retenu");
  ok(els.statut.className==="ok" && /En direct · aisstream\.io/.test(els.statutTexte.textContent),"statut « En direct » : "+els.statutTexte.textContent);
  ok(els.vLat.textContent==="47.19690°" && els.vLon.textContent==="-1.67250°" && els.vVit.textContent==="3.0 nds" && els.vCap.textContent==="95°","latitude, longitude, vitesse et cap affichés");
  ok(els.vHeure.textContent==="09:39:30" && els.vAge.textContent==="30 s","heure du relevé (Paris) et âge : "+els.vHeure.textContent+" / "+els.vAge.textContent);
  ok(/● Worker AIS : relevé il y a 30 s/.test(els.sources.textContent),"ligne de source avec l'âge");

  // --- nouveau relevé : le sentier s'allonge ; relevé identique : rien ne change ---
  rep.json=releve(5,47.1960,4.2,200);
  await t.interroger();
  ok(t.etat.fix.lat===47.196 && t.etat.sentier.length===2,"nouveau relevé : position mise à jour, sentier de 2 points");
  await t.interroger();
  ok(t.etat.sentier.length===2,"même relevé relu : pas de doublon dans le sentier");
  rep.json=releve(300,47.1950,1,10);
  await t.interroger();
  ok(t.etat.fix.lat===47.196,"relevé plus ancien que celui affiché : ignoré (jamais de retour en arrière)");

  // --- vitesse et cap absents ---
  const r=t.releveDuWorker({connexion:"connecté",releve:{lat:47.1,lon:-1.6,heureUtc:new Date(T0).toISOString()}});
  ok(r.vit===null && r.cap===null,"vitesse et cap absents → null");
  let leve=false; try{ t.releveDuWorker({releve:{lat:99,lon:0,heureUtc:"x"}}); }catch(x){ leve=true; }
  ok(leve,"relevé invalide : erreur levée");

  // --- erreurs du worker ---
  rep.hs=true; await t.interroger(); t.majTextes(horloge);
  ok(/✗ Worker AIS : réseau coupé/.test(els.sources.textContent) && els.statut.className==="ok","une coupure isolée : erreur affichée, statut inchangé");
  await t.interroger(); t.majTextes(horloge);
  ok(els.statut.className==="bad" && /Worker AIS injoignable · dernier relevé il y a/.test(els.statutTexte.textContent),"deux échecs : « injoignable » avec l'âge du dernier relevé");
  ok(els.vLat.textContent!=="—","dernières valeurs conservées à l'écran");
  rep.hs=false; rep.status=404; await t.interroger(); t.majTextes(horloge);
  ok(/✗ Worker AIS : HTTP 404/.test(els.sources.textContent),"worker non déployé (404) : erreur claire");
  rep.status=200; rep.illisible=true; await t.interroger(); t.majTextes(horloge);
  ok(/✗ Worker AIS : réponse illisible/.test(els.sources.textContent),"réponse non JSON : « réponse illisible »");
  rep.illisible=false;

  // --- essais espacés après 3 échecs ---
  const avant=urls.length;
  t.src.erreurs=3; t.src.derniere=horloge;
  t.declencher(); await attendre();
  ok(urls.length===avant,"après 3 échecs : le worker n'est plus sollicité à chaque tick");
  t.src.erreurs=0;

  // --- estimation entre deux relevés ---
  const e1=t.extrapoler({lat:47.2,lon:-1.67,vit:6,cap:0},30);
  ok(e1.extrapole && Math.abs((e1.lat-47.2)-6*0.514444*30/111320)<1e-9 && Math.abs(e1.lon+1.67)<1e-9,"cap nord à 6 nds pendant 30 s : ≈ 93 m vers le nord");
  ok(t.extrapoler({lat:47.2,lon:-1.67,vit:6,cap:90},300).lon===t.extrapoler({lat:47.2,lon:-1.67,vit:6,cap:90},60).lon,"estimation plafonnée à 60 s");
  ok(!t.extrapoler({lat:47.2,lon:-1.67,vit:0.1,cap:90},30).extrapole && !t.extrapoler({lat:47.2,lon:-1.67,vit:null,cap:null},30).extrapole,"bac à l'arrêt ou vitesse inconnue : pas d'estimation");

  // --- alertes de fraîcheur ---
  rep.json=releve(0,47.196,4.2,200); await t.interroger(); // relevé identique en position : heure plus récente
  horloge=T0+3*60000; t.majTextes(horloge);
  ok(els.statut.className==="warn" && /Dernier relevé il y a/.test(els.statutTexte.textContent),"relevé de 3 min : avertissement orange");
  horloge=T0+12*60000; t.majTextes(horloge);
  ok(els.statut.className==="bad" && /Aucun relevé depuis 12 min/.test(els.statutTexte.textContent),"relevé de 12 min : alerte rouge");

  console.log(process.exitCode?"\nÉCHEC":"\nTous les tests passent");
})();
