# Entraîne les constantes du modèle 3 (PARAM.m3 de la page) sur une fenêtre de jours, à partir des traversées recalées sur les coordonnées.
# Usage : python3 entrainer_modele3.py variables.csv 2026-11-18 2026-11-24 > m3.json
# Entrée : une ligne par traversée avec dep_recale/arr_recale, quai, jour, minute, semaine, rotation, approx, n_marche,
#          sens_courant, traversee_s, sejour_s, ecart_grille_min (écart du départ recalé au créneau officiel).
import sys, json, pandas as pd
d=pd.read_csv(sys.argv[1]); a,b=sys.argv[2],sys.argv[3]
L=d[(d.jour>=a)&(d.jour<=b)].copy(); K=10   # K : pseudo-observations du prior (rétrécissement des corrections horaires vers 0)
r=L[L.rotation&L.sejour_s.between(60,600)]
base={q:round(float(g.sejour_s.mean()/60),3) for q,g in r.groupby('quai')}
r=r.assign(res=r.sejour_s/60-r.quai.map(base),h=(r.minute//60).astype(int))
adj={str(int(h)):round(float(g.res.sum()/(len(g)+K)),3) for h,g in r.groupby('h')}
t=L[(~L.approx)&(L.n_marche>=1)&L.traversee_s.between(100,420)]
tra={('SEMAINE' if s else 'WEEKEND'):{q:{c:round(float(x.traversee_s.mean()/60),3) for c,x in g.groupby('sens_courant')} for q,g in h.groupby('quai')} for s,h in t.groupby('semaine')}
g=L[(~L.rotation)&L.ecart_grille_min.between(-6,8)]
dec={('SEMAINE' if s else 'WEEKEND'):{q:round(float(x.ecart_grille_min.mean()),3) for q,x in h.groupby('quai')} for s,h in g.groupby('semaine')}
print(json.dumps(dict(jours=[a,b],n=dict(traversees=len(t),rotation=len(r),grille=len(g)),sejour=base,sejourHeure=adj,traversee=tra,decalage=dec),indent=1,ensure_ascii=False))
