"""FastAPI microservice for PDF extraction V3 (ALLEN DLP)."""

import io
import os
import time
import uuid
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Query
from fastapi.responses import JSONResponse
from PIL import Image
from supabase import create_client, Client
from supabase.client import ClientOptions
from dotenv import load_dotenv

from engine.parser import parse_pdf
from templates.loader import resolve_template

load_dotenv("../.env.local")
load_dotenv("../.env")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("WARNING: Supabase credentials not found. Uploads will fail.")

_opts = ClientOptions(storage_client_timeout=120)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=_opts) if SUPABASE_URL and SUPABASE_KEY else None
BUCKET_NAME = "question-images"
_bucket_verified = False


def ensure_bucket_exists(max_retries: int = 3) -> bool:
    global _bucket_verified
    if _bucket_verified:
        return True

    for attempt in range(max_retries):
        try:
            buckets = supabase.storage.list_buckets()
            bucket_names = [getattr(b, 'name', '') for b in buckets]
            if BUCKET_NAME in bucket_names:
                print(f"Bucket '{BUCKET_NAME}' found.")
                _bucket_verified = True
                return True
            else:
                print(f"Bucket '{BUCKET_NAME}' not found (attempt {attempt+1}). Creating...")
                supabase.storage.create_bucket(BUCKET_NAME, options={"public": True})
                print("Bucket created successfully!")
                _bucket_verified = True
                return True
        except Exception as e:
            print(f"Bucket check attempt {attempt+1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                time.sleep(wait)
    return False


if supabase:
    ensure_bucket_exists()

app = FastAPI(title="MockBuilder PDF Extractor v3")


def upload_image(pil_img: Image.Image, test_id: str, filename: str) -> str:
    if not supabase:
        return f"local://{filename}"

    img_byte_arr = io.BytesIO()
    pil_img.save(img_byte_arr, format='PNG', optimize=True)
    file_bytes = img_byte_arr.getvalue()

    path = f"{test_id}/{filename}"

    for attempt in range(2):
        try:
            supabase.storage.from_(BUCKET_NAME).upload(
                path,
                file_bytes,
                {"content-type": "image/png", "upsert": "true"}
            )
            return supabase.storage.from_(BUCKET_NAME).get_public_url(path)
        except Exception as e:
            err_str = str(e)
            if "Bucket not found" in err_str or "404" in err_str:
                if attempt == 0:
                    try:
                        supabase.storage.create_bucket(BUCKET_NAME, options={"public": True})
                        time.sleep(1)
                        continue
                    except Exception as create_err:
                        if "already exists" in str(create_err).lower():
                            time.sleep(1)
                            continue
                        raise create_err
            raise e

    raise Exception(f"Failed to upload {filename} after retries")


@app.post("/extract")
async def extract_pdf(
    testId: str,
    file: UploadFile = File(...),
    template: Optional[str] = Query(None, description="Template name (e.g. 'Allen DLP')"),
):
    print(f"Starting v3 extraction for testId: {testId}")
    pdf_bytes = await file.read()

    with open("last_upload.pdf", "wb") as f:
        f.write(pdf_bytes)

    tmpl = resolve_template(pdf_bytes, template)
    questions, page_images = parse_pdf(pdf_bytes, template=tmpl)
    
    # Save debug info
    with open("last_debug.json", "w", encoding="utf-8") as f:
        debug_data = []
        for q in questions:
            debug_data.append({
                "id": q.question_id,
                "part": q.part,
                "section": q.section,
                "number": q.question_number,
                "bbox": [q.bbox_px[0], q.bbox_px[1], q.bbox_px[2], q.bbox_px[3]],
                "type": q.section_type
            })
        import json
        json.dump(debug_data, f, indent=2)

    print(f"Extraction found {len(questions)} questions.")

    results = []
    review_count = 0

    for q in questions:
        page_img = page_images[q.page - 1]

        # Single combined crop per question.
        q_crop = page_img.crop(q.bbox_px)
        clean_part = q.part.lower().replace(" ", "_")
        clean_sec = q.section.lower().replace(" ", "_")
        q_filename = f"{clean_part}_{clean_sec}_q{q.question_number}_{uuid.uuid4().hex[:6]}.png"
        
        q_url = upload_image(q_crop, testId, q_filename)

        if q.needs_review:
            review_count += 1

        results.append({
            "question_id": q.question_id,
            "part": q.part,
            "section": q.section,
            "printed_number": q.question_number,
            "type": q.section_type,
            "image": q_url,
            "needs_review": q.needs_review,
            "review_reason": q.review_reason,
            "confidenceNotes": q.confidence_notes,
        })

    print(f"Extraction complete for {testId}. {len(results)} questions, {review_count} flagged for review.")
    return JSONResponse({"success": True, "questions": results, "reviewCount": review_count})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
