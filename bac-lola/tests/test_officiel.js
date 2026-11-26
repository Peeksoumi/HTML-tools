// Informations officielles du Département (perturbations + horaires) avec un faux DOM : node tests/test_officiel.js
const fs=require('fs'), vm=require('vm'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>"));
const els={}, doc={getElementById:id=>els[id]||(els[id]={innerHTML:"",className:"",textContent:""})};
let events=[], horaires, ko=false, urls=[];
const HOR={liaison1:{from:"Basse-Indre",to:"Indret",from_first:"5h30",from_last:"22h10",from_period:"20 min",from_message:"",to_first:"5h40",to_last:"22h20",mode:"special",from_first_special:"6h30",from_last_special:"21h30",to_first_special:"6h40",to_last_special:"21h20"}};
horaires=JSON.parse(JSON.stringify(HOR));
const ctx={document:doc,
  fetch:async u=>{ urls.push(u);
    if(/traficevents/.test(u)){ if(ko) throw new Error("réseau"); return {ok:true,json:async()=>events}; }
    if(/bacs_horaires/.test(u)){ if(ko) throw new Error("réseau"); return {ok:true,json:async()=>({bacs_horaires:horaires})}; }
    return {ok:false,status:500,json:async()=>({}),text:async()=>""}; },
  setInterval:()=>0,setTimeout,clearTimeout,AbortController,Intl,Date,Math,JSON,console,parseFloat,isFinite,Number,Set,Array,Object,String,RegExp,Error};
vm.createContext(ctx);
vm.runInContext(src+"\nthis.__t={lireOfficielEv,lireOfficielHor};",ctx);
const ok=(c,msg)=>{ if(!c){ console.error("ÉCHEC :",msg); process.exitCode=1; } else console.log("ok :",msg); };
(async()=>{
  await ctx.__t.lireOfficielEv(); await ctx.__t.lireOfficielHor();
  let o=els.officiel.innerHTML;
  ok(urls.some(u=>u==="https://api.loire-atlantique.fr/opendata/1.0/traficevents?filter=Bac%20de%20Loire%20Basse-Indre%20-%20Indret"),"adresse des perturbations identique à celle de l'appli officielle");
  ok(/aucune perturbation annoncée/.test(o)&&!/off-ev/.test(o),"liste vide : « aucune perturbation annoncée », pas de bloc d'alerte");
  ok(/Basse-Indre 5h30→22h10 · Indret 5h40→22h20/.test(o)&&/un départ toutes les 20 min/.test(o)&&/Basse-Indre 6h30→21h30 · Indret 6h40→21h20/.test(o),"horaires officiels affichés (normaux et jours spéciaux)");
  ok(!/class="alerte"/.test(o),"horaires identiques à la grille GTFS : pas d'avertissement");
  events=[{type:"Interruption",statut:"en cours",datePublication:"2026-11-26 08:00:00.0",ligne1:"Bac arrêté <b>vent</b>",ligne2:"Reprise vers 14h",ligne3:"",ligne4:null}];
  await ctx.__t.lireOfficielEv(); o=els.officiel.innerHTML;
  ok(/off-ev en-cours/.test(o)&&/Interruption · en cours/.test(o)&&/Reprise vers 14h/.test(o),"perturbation en cours affichée avec ses lignes");
  ok(!/<b>vent<\/b>/.test(o)&&/&lt;b&gt;vent/.test(o),"texte de l'alerte échappé (pas de HTML injecté)");
  ok(!/aucune perturbation annoncée/.test(o),"plus de mention « aucune perturbation »");
  events=[{type:"Travaux",statut:"prévisionnel",ligne1:"Fermeture le 3 décembre"}];
  await ctx.__t.lireOfficielEv(); ok(/off-ev prevu/.test(els.officiel.innerHTML),"perturbation prévisionnelle : style distinct");
  horaires.liaison1.from_last="22h30"; horaires.liaison1.from_message="Horaires modifiés";
  await ctx.__t.lireOfficielHor(); o=els.officiel.innerHTML;
  ok(/class="alerte"[^>]*>⚠ Les horaires officiels du Département diffèrent/.test(o),"horaires différents de la grille : avertissement");
  ok(/Département · horaires<\/div><div>Horaires modifiés/.test(o),"message d'horaires du Département affiché");
  ko=true; events=[]; await ctx.__t.lireOfficielEv(); o=els.officiel.innerHTML;
  ok(/vérification impossible depuis/.test(o),"API injoignable après un succès : dernier état conservé + mention");
  els.officiel.innerHTML=""; // première lecture en échec : message d'indisponibilité
  vm.runInContext("offEv=null;offEvMaj=0;",ctx); await ctx.__t.lireOfficielEv();
  ok(/indisponibles/.test(els.officiel.innerHTML),"API injoignable dès le départ : « indisponibles »");
})();
