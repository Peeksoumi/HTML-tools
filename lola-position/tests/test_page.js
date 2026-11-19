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

// Réponses simulées de chaque source ; hs = réseau coupé, status = code HTTP
const rep={
  worker:{json:{connexion:"connecté",releve:null}},
  direct:{json:{samples:[[T0-60000,47.19744,-1.67439,0.1,null],[T0-30000,47.1969,-1.6731,3.0,95]]}},
  github:{json:{samples:[[T0-300000,47.19744,-1.67439,0.1,null]]}}
};
const cleDe=u=>/lola-ais/.test(u)?"worker":/lola-direct/.test(u)?"direct":"github";
const ctx={
  document:doc, navigator:{}, window:{devicePixelRatio:1},
  ResizeObserver:class{observe(){}}, requestAnimationFrame:noop,
  setInterval:noop, setTimeout, clearTimeout, AbortController, Intl, Date:FauxDate, Math, JSON, console, parseFloat, isFinite, Number, Object, Array, String,
  fetch:async(u)=>{ urls.push(u); const r=rep[cleDe(u)]; if(r.hs) throw new Error("réseau coupé");
    return {ok:(r.status||200)<400,status:r.status||200,json:async()=>{ if(r.illisible) throw new Error("x"); return r.json; }}; }
};
vm.createContext(ctx);
vm.runInContext(m[1]+"\nthis.__t={etat,sources,interroger,declencher,choisirReleve,extrapoler,majTextes,statut,githubUtile,releveDeEchantillons,releveDuWorker};",ctx);

const ok=(c,msg)=>{ if(!c){ console.error("ÉCHEC :",msg); process.exitCode=1; } else console.log("ok :",msg); };
const attendre=()=>new Promise(r=>setTimeout(r,20));
const nbGithub=()=>urls.filter(u=>cleDe(u)==="github").length;

(async()=>{
  const t=ctx.__t;
  await attendre(); // lectures lancées au démarrage de la page

  // --- choix du relevé ---
  ok(t.etat.source==="direct" && t.etat.fix.lat===47.1969 && t.etat.fix.vit===3 && t.etat.fix.cap===95,"relais direct : relevé le plus récent retenu (et non le dernier de la liste)");
  ok(urls.some(u=>/lola-ais\.[^/]+\.workers\.dev\/\?format=json$/.test(u)) && urls.some(u=>/raw\.githubusercontent\.com\/Peeksoumi\/lola-relais\/main\/positions\.json\?t=/.test(u)),"trois sources lues : worker (JSON), relais direct, GitHub (?t= anti-cache)");
  t.majTextes(horloge);
  ok(els.statut.className==="ok" && /En direct · Relais du site/.test(els.statutTexte.textContent),"statut « En direct » avec la source retenue : "+els.statutTexte.textContent);
  ok(els.vLat.textContent==="47.19690°" && els.vVit.textContent==="3.0 nds" && els.vCap.textContent==="95°","latitude, vitesse et cap affichés");
  ok(els.vHeure.textContent==="09:39:30" && els.vAge.textContent==="30 s","heure du relevé (Paris) et âge : "+els.vHeure.textContent+" / "+els.vAge.textContent);

  // --- le worker AIS prend la main dès qu'il a un relevé plus récent ---
  rep.worker.json={connexion:"connecté",releve:{lat:47.1960,lon:-1.6725,vitesseNoeuds:4.2,capDegres:200,heureUtc:new Date(T0-5000).toISOString(),ageSecondes:5}};
  await t.interroger("worker");
  ok(t.etat.source==="worker" && t.etat.fix.lat===47.196 && t.etat.fix.vit===4.2,"worker plus récent : il devient la source affichée");
  t.majTextes(horloge);
  ok(/Worker AIS : relevé il y a 5 s/.test(els.sources.textContent),"ligne de source du worker");

  // --- jamais de retour en arrière, priorité en cas d'égalité ---
  const f=(t0,lat)=>({t:t0,lat:lat,lon:-1.67,vit:null,cap:null});
  const ex=t.choisirReleve({worker:{fix:f(1000,1)},direct:{fix:f(1000,2)},github:{fix:f(900,3)}});
  ok(ex.source==="worker","égalité d'heure : priorité au worker");
  const ex2=t.choisirReleve({worker:{fix:null},direct:{fix:f(1000,2)},github:{fix:f(2000,3)}});
  ok(ex2.source==="github","relevé GitHub plus récent que le relais : il est retenu");
  ok(t.choisirReleve({worker:{fix:null},direct:{fix:null},github:{fix:null}})===null,"aucune source avec relevé : rien retenu");

  // --- worker sans relevé, worker en panne ---
  rep.worker.json={connexion:"connecté",releve:null};
  await t.interroger("worker"); t.majTextes(horloge);
  ok(/Worker AIS : aucun relevé \(connexion : connecté\)/.test(els.sources.textContent),"worker connecté mais sans relevé : état de connexion affiché");
  rep.worker.hs=true;
  await t.interroger("worker"); t.majTextes(horloge);
  ok(/✗ Worker AIS : réseau coupé/.test(els.sources.textContent) && els.statut.className==="ok","worker en panne : erreur affichée, la page continue avec le relais");
  rep.worker.hs=false; rep.worker.status=404;
  await t.interroger("worker"); t.majTextes(horloge);
  ok(/✗ Worker AIS : HTTP 404/.test(els.sources.textContent),"worker absent (404) : erreur claire");
  rep.worker.status=200; rep.worker.illisible=true;
  await t.interroger("worker"); t.majTextes(horloge);
  ok(/✗ Worker AIS : réponse illisible/.test(els.sources.textContent),"réponse non JSON : « réponse illisible »");
  rep.worker.illisible=false;

  // --- données invalides ignorées ---
  const e=t.releveDeEchantillons({samples:[[NaN,1,2],[T0,95,0],[T0,47.1,-1.6,null,null],"x"]});
  ok(e && e.lat===47.1 && e.vit===null && e.cap===null,"échantillons invalides ignorés, vitesse et cap absents → null");
  let leve=false; try{ t.releveDeEchantillons({}); }catch(x){ leve=true; }
  ok(leve,"format inattendu : erreur levée");

  // --- repli GitHub : seulement si les autres n'ont rien de récent ---
  const avant=nbGithub();
  t.declencher("github");
  await attendre();
  ok(nbGithub()===avant,"relevé direct récent : la copie GitHub n'est pas interrogée");
  ok(t.githubUtile()===false,"githubUtile faux tant qu'un relevé a moins de 2 min");

  // --- source en panne répétée : essais espacés ---
  const avantW=urls.filter(u=>cleDe(u)==="worker").length;
  t.sources.worker.erreurs=3; t.sources.worker.derniere=horloge;
  t.declencher("worker"); await attendre();
  ok(urls.filter(u=>cleDe(u)==="worker").length===avantW,"après 3 échecs : la source n'est plus sollicitée à chaque tick");
  t.sources.worker.erreurs=0;

  // --- estimation entre deux relevés ---
  const e1=t.extrapoler({lat:47.2,lon:-1.67,vit:6,cap:0},30);
  ok(e1.extrapole && Math.abs((e1.lat-47.2)-6*0.514444*30/111320)<1e-9 && Math.abs(e1.lon+1.67)<1e-9,"cap nord à 6 nds pendant 30 s : ≈ 93 m vers le nord");
  const e2=t.extrapoler({lat:47.2,lon:-1.67,vit:6,cap:90},300), e3=t.extrapoler({lat:47.2,lon:-1.67,vit:6,cap:90},60);
  ok(e2.lon===e3.lon,"estimation plafonnée à 60 s");
  ok(!t.extrapoler({lat:47.2,lon:-1.67,vit:0.1,cap:90},30).extrapole && !t.extrapoler({lat:47.2,lon:-1.67,vit:null,cap:null},30).extrapole,"bac à l'arrêt ou vitesse inconnue : pas d'estimation");

  // --- alertes de fraîcheur et de connexion ---
  horloge=T0+3*60000; t.majTextes(horloge);
  ok(els.statut.className==="warn" && /Dernier relevé il y a/.test(els.statutTexte.textContent),"relevé de 3 min : avertissement orange");
  horloge=T0+12*60000; t.majTextes(horloge);
  ok(els.statut.className==="bad" && /Aucun relevé depuis 12 min/.test(els.statutTexte.textContent),"relevé de 12 min : alerte rouge");
  rep.worker.hs=rep.direct.hs=rep.github.hs=true;
  for(const c of ["worker","direct","github"]) await t.interroger(c);
  t.majTextes(horloge);
  ok(els.statut.className==="bad" && /Connexion perdue · dernier relevé il y a/.test(els.statutTexte.textContent),"trois sources coupées : « Connexion perdue » avec l'âge du dernier relevé");
  ok(els.vLat.textContent!=="—","dernières valeurs conservées à l'écran en cas de coupure");

  console.log(process.exitCode?"\nÉCHEC":"\nTous les tests passent");
})();
