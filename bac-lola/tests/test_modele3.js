// Modèle 3 : recalage des heures d'événement sur les coordonnées. node tests/test_modele3.js
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const fin=html.indexOf("//  INTERFACE"), debut=html.lastIndexOf("<script>",fin)+8;
const moteur=html.slice(debut,fin);
const iface=html.slice(html.indexOf("const RECALAGE"),html.indexOf("function traiter("));
const M=new Function(moteur+"\n"+iface+"\nreturn {recalerEvenement,DISTANCE_TOTALE_TRACE,PARAM};")();
let ko=0; const ok=(c,m)=>{ if(!c){ ko++; console.error("ÉCHEC :",m); } else console.log("ok :",m); };
// Départ d'Indret (p = 0) : repos puis première position en mouvement 60 s plus tard à 12 m ; heure brute du détecteur entre les deux
const dep=M.recalerEvenement({type:"dep",q:"S",t:30000},[{t:0,p:0,v:0},{t:60000,p:12.2/M.DISTANCE_TOTALE_TRACE,v:3},{t:120000,p:0.2,v:4.4}]);
ok(dep>=0&&dep<60000&&Math.abs(dep-49600)<1500,"départ recalé entre les deux positions, ≈ 10 s avant la position en mouvement : "+dep);
// Arrivée à Basse-Indre (p = 1) : l'arrivée détectée à 60 s est recalée avant, d'après la distance restante et le freinage
const arr=M.recalerEvenement({type:"arr",q:"N",t:60000},[{t:0,p:1-40.6/M.DISTANCE_TOTALE_TRACE,v:3},{t:60000,p:1,v:0}]);
ok(arr>0&&arr<60000&&Math.abs(arr-46400)<1500,"arrivée recalée avant l'heure brute (freinage) : "+arr);
// Sans position encadrante : heure brute inchangée
ok(M.recalerEvenement({type:"dep",q:"S",t:5},[])===5,"sans historique, l'heure brute est conservée");
// Constantes du modèle 3 : entraînées sur 7 jours, structure complète
const m=M.PARAM.m3;
ok(["N","S"].every(q=>m.sejour[q]>3&&m.sejour[q]<6&&["SEMAINE","WEEKEND"].every(t=>["flot","jusant"].every(s=>m.traversee[t][q][s]>2.8&&m.traversee[t][q][s]<4)&&m.decalage[t][q]>0&&m.decalage[t][q]<2.5)),"constantes m3 complètes et plausibles");
process.exit(ko?1:0);
