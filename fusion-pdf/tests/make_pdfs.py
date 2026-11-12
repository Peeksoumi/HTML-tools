from reportlab.lib.pagesizes import A4, letter
from reportlab.pdfgen import canvas
def mk(name, size, n, label):
    c = canvas.Canvas(name, pagesize=size)
    for i in range(1, n+1):
        c.setFont("Helvetica-Bold", 40); c.drawString(80, size[1]-120, f"{label} page {i}")
        c.setFont("Helvetica", 14); c.drawString(80, size[1]-160, "Texte sélectionnable de test")
        c.rect(60, 60, size[0]-120, 200); c.showPage()
    c.save()
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
mk("A.pdf", A4, 2, "A"); mk("B.pdf", letter, 3, "B")
