// Tests du moteur (horaires, modes, prévision) : node tests/test_moteur.js
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.lastIndexOf("<script>",html.indexOf("//  INTERFACE"))+8,html.indexOf("//  INTERFACE"));
const M=new Function(src+"\nreturn {msParis,creneauxJour,creneauProche,detecterMode,prevoir,typeService,formatHM,dansService,PARAM,corrCourant};")();
let ko=0; const ok=(c,m)=>{ if(!c){ ko++; console.error("ÉCHEC :",m); } else console.log("ok :",m); };
const hm=ms=>M.formatHM(ms), P=(cle,h,m=0)=>M.msParis(cle,h*60+m);

// Grille officielle
const sem=M.creneauxJour("2026-11-17","N"), we=M.creneauxJour("2026-11-21","N"), fe=M.creneauxJour("2026-11-11","N");
ok(hm(sem[0])==="05:30"&&hm(sem[sem.length-1])==="22:10"&&sem.length===51,"semaine, Basse-Indre : 05:30→22:10, 51 départs");
ok(hm(we[0])==="06:30"&&hm(we[we.length-1])==="21:30","week-end, Basse-Indre : 06:30→21:30");
ok(M.typeService("2026-11-11")==="WEEKEND"&&fe.length===we.length,"11 novembre servi comme un week-end");
ok(M.creneauxJour("2027-05-01","N").length===0,"1er mai 2027 : pas de service");
ok(hm(M.creneauxJour("2026-11-17","S")[0])==="05:40","semaine, Indret : premier départ 05:40");
ok(hm(M.creneauProche(P("2026-11-17",8,12),"N"))==="08:10","créneau le plus proche de 08:12 (BI) = 08:10");
ok(M.creneauProche(P("2026-11-17",3,0),"N")===null,"pas de créneau la nuit");

// Modes
const d=(h,m,q)=>({type:"dep",q,t:P("2026-11-17",h,m)});
const grille=[d(9,12,"N"),d(9,22,"S"),d(9,32,"N"),d(9,42,"S")];
ok(M.detecterMode(grille,P("2026-11-17",9,45)).mode==="normal","départs à +2 min de la grille → normal");
const rot=[d(7,6,"N"),d(7,11,"S"),d(7,18,"N"),d(7,25,"S")];
ok(M.detecterMode(rot,P("2026-11-17",7,27)).mode==="rotation","départs toutes les ~6 min → rotation continue");
const ret=[d(9,18,"N"),d(9,28,"S"),d(9,38,"N"),d(9,48,"S")];
ok(M.detecterMode(ret,P("2026-11-17",9,50)).mode==="perturbation","départs à +8 min → retard / perturbation");
ok(M.detecterMode(grille,P("2026-11-17",3,0)).raison==="Hors service","3 h du matin → hors service");
ok(M.detecterMode(grille,P("2026-11-17",11,0)).raison.indexOf("Arrêt")===0,"aucun mouvement depuis > 30 min en journée → arrêt");
ok(M.detecterMode(grille,P("2026-11-17",11,0),P("2026-11-17",10,50)).mode!=="arret","mouvement vu récemment → pas d'arrêt");

// Prévision en grille : bac arrivé à Basse-Indre à 09:36 → départ 09:32 manqué ? non : 09:50 + 2,3
const evs=[d(9,12,"N"),d(9,22,"S"),d(9,32,"N"),{type:"arr",q:"S",t:P("2026-11-17",9,35)},d(9,42,"S"),{type:"arr",q:"N",t:P("2026-11-17",9,46)}];
const pr=M.prevoir(evs,P("2026-11-17",9,47),4);
const dep=pr.evenements[0];
// Modèle 3 : le sens du courant ne décale plus les départs (effet absent des départs recalés) ; il est inclus dans la durée de traversée apprise
const sauve=M.PARAM.courantDepart; M.PARAM.courantDepart={N:{flot:5,jusant:-5},S:{flot:5,jusant:-5}};
const sans=M.prevoir(evs,P("2026-11-17",9,47),4).evenements[0]; M.PARAM.courantDepart=sauve;
ok(dep.type==="dep"&&dep.q==="N"&&dep.t===sans.t&&hm(dep.t)==="09:51","grille : départ prévu = créneau 09:50 + décalage appris, indépendant du courant, obtenu "+hm(dep.t));
ok(dep.delta>0.5&&dep.delta<3.5,"écart au nominal ≈ +2 min : "+dep.delta.toFixed(1));
ok(pr.evenements.map(e=>e.type+e.q).join(",")==="depN,arrS,depS,arrN","alternance départ/arrivée");
// Prévision en rotation
const evr=[d(7,6,"N"),{type:"arr",q:"S",t:P("2026-11-17",7,9)},d(7,11,"S"),{type:"arr",q:"N",t:P("2026-11-17",7,14)},d(7,18,"N"),{type:"arr",q:"S",t:P("2026-11-17",7,21)}];
const pr2=M.prevoir(evr,P("2026-11-17",7,22),2);
const sej=(pr2.evenements[0].t-P("2026-11-17",7,21))/60000;
ok(pr2.mode.mode==="rotation"&&pr2.evenements[0].mode==="rotation"&&sej>3&&sej<5,"rotation : départ ≈ arrivée + séjour appris du quai Indret (≈ 4 min), obtenu "+sej.toFixed(1));
const sejN=M.PARAM.m3.sejour.N, sejS=M.PARAM.m3.sejour.S;
ok(sejN>sejS,"séjour appris : Basse-Indre plus long qu'Indret ("+sejN+" > "+sejS+" min)");
// Fin de la rotation du soir à 18:55 : une arrivée à 18:56 est en grille, une arrivée à 18:50 en rotation
const soir=h=>[d(18,h-12,"N"),{type:"arr",q:"S",t:P("2026-11-17",18,h-9)},d(18,h-7,"S"),{type:"arr",q:"N",t:P("2026-11-17",18,h-4)},d(18,h,"N"),{type:"arr",q:"S",t:P("2026-11-17",18,h+3)}];
ok(M.prevoir(soir(47),P("2026-11-17",18,50),1).evenements[0].mode==="rotation","18:50 : encore en rotation du soir");
ok(M.prevoir(soir(53),P("2026-11-17",18,57),1).evenements[0].mode==="grille","18:56 : rotation du soir terminée (fenêtre jusqu'à 18:55)");
// Retour au poste de nuit : bac en retard, arrivé à Indret à 22:30, plus de 6 min après le dernier départ nominal (22:20) → prochain créneau à 05:40, il repart 2 min plus tard vers Basse-Indre
const evN=[d(22,9,"S"),{type:"arr",q:"N",t:P("2026-11-17",22,13)},d(22,26,"N"),{type:"arr",q:"S",t:P("2026-11-17",22,30)}];
const rn=M.prevoir(evN,P("2026-11-17",22,31),2).evenements[0];
ok(rn.type==="dep"&&rn.q==="S"&&Math.abs((rn.t-P("2026-11-17",22,30))/60000-2)<0.5,"retour de nuit : arrivée Indret 22:30 → départ vers Basse-Indre ≈ 22:32, obtenu "+hm(rn.t));
process.exit(ko?1:0);
