import argparse
import json
from pathlib import Path

from engine.parser import parse_pdf
from templates.loader import resolve_template

def get_args():
    parser = argparse.ArgumentParser(description="Extract questions as single images from JEE PDFs.")
    parser.add_argument("--pdf", type=str, required=True, help="Path to the PDF file")
    parser.add_argument("--out", type=str, required=True, help="Output directory")
    parser.add_argument("--template", type=str, default=None, help="Force a specific template by name")
    return parser.parse_args()


def process_pdf(args):
    pdf_path = Path(args.pdf)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Opening PDF: {pdf_path}")
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()
        
    tmpl = resolve_template(pdf_bytes, args.template)
    questions, page_images = parse_pdf(pdf_bytes, template=tmpl)
    
    print(f"Extraction found {len(questions)} questions.")

    manifest = {
        "source_pdf": str(pdf_path.name),
        "questions": []
    }
    
    # Save full page images for review tool
    for i, p_img in enumerate(page_images):
        p_img.save(out_dir / f"page{i+1}_full.png")

    for q in questions:
        page_img = page_images[q.page - 1]
        
        # Single combined crop per question.
        q_crop = page_img.crop(q.bbox_px)
        clean_part = q.part.lower().replace(" ", "_")
        clean_sec = q.section.lower().replace(" ", "_")
        q_filename = f"{clean_part}_{clean_sec}_q{q.question_number}.png"
        
        q_crop.save(out_dir / q_filename)

        manifest["questions"].append({
            "question_id": q.question_id,
            "part": q.part,
            "section": q.section,
            "printed_number": q.question_number,
            "type": q.section_type,
            "image": q_filename,
            "page": q.page,
            "bbox_px": q.bbox_px,
            "needs_review": q.needs_review,
            "review_reason": q.review_reason,
            "confidenceNotes": q.confidence_notes,
        })

    with open(out_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        
    print(f"Saved {len(questions)} questions to {out_dir}/manifest.json")

if __name__ == "__main__":
    args = get_args()
    process_pdf(args)
