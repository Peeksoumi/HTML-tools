"""Test de fumée de ladder-yaskawa : page chargée dans Chrome (aucun accès réseau)."""
import pathlib, sys, tempfile
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1] / "index.html"
HTML = ROOT.read_text(encoding="utf-8")
errors = []
def check(name, cond):
    print(("OK  " if cond else "FAIL"), name)
    if not cond: errors.append(name)

# Règles du dépôt
for motif, mini in [("HTML-tools/issues/new?title=%5Bladder-yaskawa%5D", 1), ('rel="icon"', 1), ('rel="manifest"', 1),
                    ('download="ladder-yaskawa.html"', 1), ('id="fonctionnement"', 1)]:
    check(f"règle dépôt : {motif}", HTML.count(motif) >= mini)

LST = "\r\n".join(["/CIOPRG DX", "//NAME HANDLING", "//ATTR SC", "//$M"] + ["0,0,0,0,0,0,0,0,0,0"] * 8 + ["//KEY 0",
    "PART 1", "STR #70017", "OUT #70020",
    "PART 2", "STR #00010", "AND #00011", "OUT #10010", "STR #70101", "AND-NOT #20010", "OUT #30010",
    "STR #10010", "OUT #70101", "STR #00012", "OR #70101", "OUT #10011", "STR #20011", "OR #20012", "STR #70030",
    "OR-NOT #70031", "AND-STR", "OUT #30015", "STR #70101", "OUT #79700",
    "END", "//ALARM1", "AIR PRESSURE LOW", "", "//MESSAGE1", "", ""])

with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
    d = pathlib.Path(tmp) / "backup"; d.mkdir()
    (d / "CIOPRG.LST").write_bytes(LST.encode("latin1"))
    (d / "IONAME.DAT").write_bytes(b"/IONAME\r\n//IN\r\nDEPART CYCLE,ARRET,,\r\n//OUT\r\nVERIN AVANCE,,,\r\n")
    (d / "ALMHIST.DAT").write_bytes(b"/ALMHIST\r\n//MINOR\r\n1,9064,2026/11/18,10:02,0\r\n2,4107,2026/11/18,10:05,1\r\n")
    (d / "PANEL.DAT").write_bytes(b"//IFPANEL 1\r\n///NAME Cellule,Cell\r\n1A,1,1,2,7,DEPART,,,1,1,1,10010,0,1,00010,0,0,0,0,,,,0\r\n")
    (d / "MAIN.JBI").write_bytes(b"/JOB\r\n//NAME MAIN\r\n//INST\r\nNOP\r\nWAIT IN#(1)=ON\r\nDOUT OT#(1) ON\r\nEND\r\n")

    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = br.new_page(viewport={"width": 1400, "height": 1000}); js_err = []
    pg.on("pageerror", lambda e: js_err.append(str(e)))
    pg.goto(ROOT.as_uri())
    pg.set_input_files("#dirInput", str(d)); pg.wait_for_timeout(600)

    check("relecture fidèle", "relecture fidèle ✓" in pg.inner_text("#fileInfo"))
    check("7 rungs dessinés", pg.locator(".rung").count() == 7 and pg.locator(".badge.txt").count() == 0)
    check("noms IONAME.DAT", pg.evaluate("nameOf('#00010')") == "DEPART CYCLE" and pg.evaluate("nameOf('#10010')") == "VERIN AVANCE")
    check("alarme utilisateur nommée", pg.evaluate("nameOf('#79700')") == "Alarme utilisateur 1 (9064)")
    check("export identique sans modification", pg.evaluate("buildText()") == LST)
    # équivalence logique arbre <-> liste d'instructions (évaluation par pile, entrées aléatoires)
    bad = pg.evaluate("""() => { function ev(lines, env){ const st=[]; let rr=null; const out={};
        for (const l of lines){ const {op,args}=splitInstr(l); if(!op) continue; const v=!!env[args];
          if (op==='STR'||op==='STR-NOT'){ if(rr!==null) st.push(rr); rr = op==='STR'?v:!v; }
          else if (op==='AND') rr=rr&&v; else if (op==='AND-NOT') rr=rr&&!v; else if (op==='OR') rr=rr||v; else if (op==='OR-NOT') rr=rr||!v;
          else if (op==='AND-STR') rr=st.pop()&&rr; else if (op==='OR-STR') rr=st.pop()||rr; else out[op+args]=rr; }
        return JSON.stringify(out); }
      let bad=0; for (const r of rungs()){ const c=compileRung(r); const a=[...new Set(r.raw.map(l=>splitInstr(l).args))];
        for (let t=0;t<64;t++){ const env={}; a.forEach(x=>env[x]=Math.random()<.5); if (ev(r.raw,env)!==ev(c,env)){bad++;break;} } } return bad; }""")
    check("équivalence logique", bad == 0)
    # tri par n° de sortie sur la PART 2
    pg.evaluate("selRungs=new Set(rungs().slice(1).map(r=>r.id)); render()")
    pg.click("#btnSortAsc")
    keys = pg.evaluate("rungs().slice(1).map(outKey)")
    check("tri par sortie", keys == sorted(keys))
    # PART 1 verrouillée
    pg.evaluate("focusRung=rungs()[0].id; selEls=[]; render()")
    pg.click("[data-p=rSerR]")
    check("PART 1 verrouillée", "verrouillé" in pg.inner_text("#toast"))
    # édition graphique : contact en parallèle
    r = pg.evaluate("rungs().find(r=>outKey(r)===10010).id")
    pg.evaluate(f"focusRung='{r}'; selElRung='{r}'; selEls=[getItem('{r}').logic.children[0].id]; render()")
    pg.fill("#pNewAddr", "#70123"); pg.click("[data-p=par]")
    check("ajout en parallèle", pg.evaluate(f"getItem('{r}').raw.join('|')") == "STR #00010|OR #70123|AND #00011|OUT #10010")
    pg.keyboard.press("Escape"); pg.locator("body").click(position={"x": 5, "y": 5}); pg.keyboard.press("Control+z")
    check("annuler", pg.evaluate(f"getItem('{r}').raw.join('|')") == "STR #00010|AND #00011|OUT #10010")
    # recherche globale
    pg.fill("#sigSearch", "verin"); pg.press("#sigSearch", "Enter"); pg.wait_for_timeout(100)
    xref = pg.inner_text("#panel").upper()
    check("recherche globale (ladder + job + IF panel)", pg.evaluate("hlAddr") == "#10010" and "JOB" in xref and "IF PANEL" in xref)
    # sauvegarde
    check("historique d'alarmes", pg.evaluate("BK.almhist.map(r=>r.code).join()") == "9064,4107")
    check("IF panel", pg.evaluate("BK.ifpanel[0].items[0].input.ref") == "#10010")
    check("job", pg.evaluate("BK.jobs[0].refs.length") == 2)
    pg.click("#btnBackup"); pg.click("[data-bktab=alm]")
    check("onglet alarmes", "Alarme utilisateur 1" in pg.inner_text("#bkView"))
    pg.click("#dlgFoot button.primary")
    # comparaison
    b = LST.replace("AND #00011", "AND-NOT #00011")
    f = pathlib.Path(tmp) / "B.LST"; f.write_bytes(b.encode("latin1"))
    pg.set_input_files("#cmpInput", str(f)); pg.wait_for_timeout(300)
    check("comparaison", pg.evaluate("CMP.ops.filter(o=>o.t==='mod').length") == 1)
    check("aucune erreur JavaScript", not js_err)
    br.close()

print(f"\n{len(errors)} échec(s)" if errors else "\nTous les tests passent")
sys.exit(1 if errors else 0)
