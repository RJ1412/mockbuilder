import sys
import os
from engine.parser import parse_pdf
from templates.loader import resolve_template

if __name__ == "__main__":
    pdf_path = "last_upload.pdf"
    if not os.path.exists(pdf_path):
        print("No last_upload.pdf found")
        sys.exit(1)
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()
        
    template = resolve_template(pdf_bytes)
    print(f"Detected template: {template.name}")
    
    from engine.parser import detect_sections, get_active_section, Candidate
    import pdfplumber
    import io
    
    pdf_plumber = pdfplumber.open(io.BytesIO(pdf_bytes))
    from engine.parser import _pdf_to_px, find_column_split, group_words_into_lines, find_column_divider
    
    for i, page in enumerate(pdf_plumber.pages[:3]):
        words = page.extract_words()
        lines_objs = getattr(page, "lines", []) or []
        rects_objs = getattr(page, "rects", []) or []
        divider_x = find_column_divider(lines_objs, rects_objs, page.width, page.height)
        print(f"Page {i+1} divider_x: {divider_x}")
        if divider_x:
            lw = [w for w in words if w["x1"] < divider_x - 5]
            rw = [w for w in words if w["x0"] > divider_x + 5]
            print(f"Left words: {len(lw)}, Right words: {len(rw)}")
        else:
            split_x = find_column_split(words, page.width, template.column_mode)
            print(f"Page {i+1} split_x: {split_x}")
            if split_x:
                lw = [w for w in words if w["x1"] < split_x + 10]
                rw = [w for w in words if w["x0"] > split_x - 10] # Using x0 instead of x1 for right words
                print(f"Left words: {len(lw)}, Right words: {len(rw)}")
        
    questions, _ = parse_pdf(pdf_bytes, template)
    print(f"Total questions extracted: {len(questions)}")
    for q in questions[:15]:
        print(f"Q{q.question_number} ({q.section_type}): bbox={q.bbox_px}")
