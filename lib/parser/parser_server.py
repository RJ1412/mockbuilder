from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import uvicorn
from advanced_pymupdf_parser import extract_questions_from_pdf
import traceback

app = FastAPI(title="Advanced PyMuPDF Parsing Microservice")

@app.post("/parse")
async def parse_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
        
    try:
        pdf_bytes = await file.read()
        questions = extract_questions_from_pdf(pdf_bytes)
        return {"success": True, "data": questions}
    except Exception as e:
        print(traceback.format_exc())
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
