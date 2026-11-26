#!/usr/bin/env python3
"""Génère index.html (autonome, hors ligne) à partir de src/template.html et vendor/. Usage : python3 build.py"""
import base64, pathlib

ici = pathlib.Path(__file__).resolve().parent
page = (ici / "src/template.html").read_text(encoding="utf-8")
for repere, fichier in {"PDF_LIB": "pdf-lib.min.js", "PDFJS": "pdf.min.mjs", "WORKER": "pdf.worker.min.mjs",
                        "OPENJPEG": "openjpeg.wasm", "JBIG2": "jbig2.wasm"}.items():
    brut = (ici / "vendor" / fichier).read_bytes()
    code = base64.b64encode(brut).decode() if fichier.endswith(".wasm") else brut.decode("utf-8")
    if repere == "WORKER":
        # Chrome refuse un worker « module » créé depuis une page file:// : on en fait un worker classique
        fin = "export{WorkerMessageHandler};"
        assert code.rstrip().endswith(fin)
        code = code.rstrip().removesuffix(fin).replace("import.meta.url", "self.location.href")
    assert "</script" not in code.lower() and "<!--" not in code, fichier
    marque = f"/*@@{repere}@@*/"
    assert page.count(marque) == 1, marque
    page = page.replace(marque, code)
(ici / "index.html").write_text(page, encoding="utf-8")
