import re
import io
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import pdfplumber

app = FastAPI(title="PDF Parser – Ordini di Consegna")


# ============================================================
# HEALTH / ROOT
# ============================================================

@app.get("/")
def root():
    return {"status": "ok", "service": "mev-pdf-parser"}

@app.get("/health")
def health():
    return {"status": "ok"}

def extract_header_info(text: str) -> dict:
    info = {}
    patterns = {
        "numeroOrdine": r"Numero d'ordine\s+(\d+)",
        "data":         r"Numero d'ordine\s+\d+\s+Data\s+(\d{2}\.\d{2}\.\d{4})",
        "dataConsegna": r"Data di consegna\s+(\d{2}\.\d{2}\.\d{4})",
        "rifContratto": r"Rif\.\s*Contratto\s+(\d+)",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        info[key] = match.group(1) if match else ""
    return info


# ============================================================
# DETTAGLIO ARTICOLI
# ============================================================

def extract_rows(text: str) -> list[dict]:
    rows = []
    pattern = re.compile(
        r'(\d{4})\s+'                           # Art.
        r'([A-Z0-9\.]+)\s*-\s*'                 # Cod.
        r'(.*?)\s+'                             # Descrizione
        r'(AR|AP|AF|PR)\s+'                     # Tipo Att.
        r'([\d\.,]+)\s+'                        # Q.tà
        r'([A-Z]{2})\s+'                        # UM
        r'([\d\.,]+)\s+'                        # Prezzo Netto
        r'([\d\.,]+).*?'                        # Importo
        r'Numero\s+RdA:\s*(\d+)'                # RdA
        r'(?:\s+(\d{6}))?'                      # Iniziativa opzionale
        r'(?:\s+AP-(\d+))?'                     # AP opzionale
        r'.*?contratto\s+n\.\s*(\d+)',          # Contratto
        re.IGNORECASE | re.DOTALL
    )
    for m in pattern.finditer(text):
        rows.append({
            "art":         m.group(1),
            "codice":      m.group(2),
            "descrizione": " ".join(m.group(3).split()),
            "tipoAtt":     m.group(4),
            "quantita":    m.group(5),
            "um":          m.group(6),
            "prezzoNetto": m.group(7),
            "importo":     m.group(8),
            "numeroRda":   m.group(9),
            "iniziativa":  m.group(10) if m.group(10) else "",
            "ap":          m.group(11) if m.group(11) else "",
            "contratto":   m.group(12),
        })
    return rows


# ============================================================
# ENDPOINT: parse PDF
# ============================================================

@app.post("/parse")
async def parse_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Il file deve essere un PDF")

    content = await file.read()

    try:
        text = ""
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += "\n" + page_text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lettura PDF: {e}")

    header = extract_header_info(text)
    rows   = extract_rows(text)

    return JSONResponse({
        "header": header,
        "rows":   rows,
        "count":  len(rows),
    })


# ============================================================
# ENDPOINT: debug — restituisce il testo grezzo
# ============================================================

@app.post("/debug")
async def debug_pdf(file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = ""
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += "\n" + page_text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lettura PDF: {e}")

    return JSONResponse({"testo": text, "lunghezza": len(text)})


# ============================================================
# HEALTH CHECK (duplicato rimosso — definizione unica sopra)
# ============================================================

