import sys
import json
import os
import re
import math
import uuid
import base64

try:
    import fitz # PyMuPDF
except ImportError:
    print(json.dumps({"error": "PyMuPDF not installed"}))
    sys.exit(1)

def is_scanned(page):
    text = page.get_text()
    if len(text.strip()) < 50:
        return True
    return False

def reconstruct_text_with_superscripts(span, next_span):
    # This function compares two spans to see if next_span is a sub/superscript
    size = span["size"]
    origin_y = span["origin"][1]
    
    n_size = next_span["size"]
    n_origin_y = next_span["origin"][1]
    
    # If font size is smaller and Y is higher (smaller value) -> superscript
    if n_size < size * 0.9:
        if n_origin_y < origin_y - (size * 0.2):
            return "sup"
        elif n_origin_y > origin_y + (size * 0.2):
            return "sub"
    return None

def apply_superscript_mapping(text, mode):
    sup_map = str.maketrans("0123456789+-=()", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾")
    sub_map = str.maketrans("0123456789+-=()", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎")
    if mode == "sup":
        return text.translate(sup_map)
    elif mode == "sub":
        return text.translate(sub_map)
    return text

def parse_pdf(pdf_path):
    if not os.path.exists(pdf_path):
        print(json.dumps({"error": f"File not found: {pdf_path}"}))
        sys.exit(1)
        
    doc = fitz.open(pdf_path)
    extracted_data = {
        "questions": [],
        "sections": [],
        "status": "success",
        "raw_text": ""
    }
    
    current_section = "Section-I"
    current_subject = "Unknown"
    
    full_text = ""
    figures_list = []

    for i in range(len(doc)):
        page = doc[i]
        width, height = page.rect.width, page.rect.height
        
        # Crop headers/footers
        margin_top = height * 0.08
        margin_bottom = height * 0.90
        
        # Process Text Dictionary for superscripts
        text_dict = page.get_text("dict")
        blocks = text_dict.get("blocks", [])
        
        valid_text_blocks = []
        for b in blocks:
            if b["type"] != 0: # Not text
                continue
            
            bbox = b["bbox"]
            if bbox[1] < margin_top or bbox[3] > margin_bottom:
                continue
                
            # Column Splitting: Left column only
            # if x0 < 0.5 width OR if width of block is > 0.7 width (header)
            x0, y0, x1, y1 = bbox
            if x0 > width * 0.5 and (x1 - x0) < width * 0.6:
                continue # Skip right column
                
            # Reconstruct text with superscripts
            block_text = ""
            for line in b["lines"]:
                spans = line["spans"]
                line_text = ""
                for s_idx in range(len(spans)):
                    span = spans[s_idx]
                    text = span["text"]
                    
                    if s_idx > 0:
                        prev_span = spans[s_idx-1]
                        mode = reconstruct_text_with_superscripts(prev_span, span)
                        if mode:
                            text = apply_superscript_mapping(text, mode)
                            
                    line_text += text
                block_text += line_text + "\n"
            
            valid_text_blocks.append((bbox[1], bbox[0], block_text))
            
        # Sort by Y then X
        valid_text_blocks.sort(key=lambda x: (x[0], x[1]))
        
        for b in valid_text_blocks:
            text = b[2].strip()
            if text:
                full_text += text + "\n"
                
                if "PART" in text.upper() and "PHYSICS" in text.upper():
                    current_subject = "Physics"
                elif "PART" in text.upper() and "CHEMISTRY" in text.upper():
                    current_subject = "Chemistry"
                elif "PART" in text.upper() and "MATHEMATICS" in text.upper():
                    current_subject = "Mathematics"
                
        # Image Extraction
        image_list = page.get_images(full=True)
        for img_index, img in enumerate(image_list):
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            ext = base_image["ext"]
            # To get bbox, we need page.get_image_rects(xref)
            rects = page.get_image_rects(xref)
            if rects:
                rect = rects[0]
                # Map to nearest question later
                b64 = base64.b64encode(image_bytes).decode('utf-8')
                figures_list.append({
                    "page": i,
                    "y0": rect.y0,
                    "b64": f"data:image/{ext};base64,{b64}"
                })

    # Basic Anchor Question Splitting
    chunks = full_text.split("(A)")
    
    for idx in range(1, len(chunks)):
        prev_chunk = chunks[idx-1]
        current_chunk = chunks[idx]
        
        q_text = prev_chunk
        last_d = q_text.rfind("(D)")
        if last_d != -1:
            q_text = q_text[last_d + 3:]
            
        q_text = re.sub(r'^[\d\.\s]+', '', q_text.strip())
        
        b_split = current_chunk.split("(B)")
        if len(b_split) < 2: continue
        option_a = b_split[0].strip()
        
        c_split = b_split[1].split("(C)")
        if len(c_split) < 2: continue
        option_b = c_split[0].strip()
        
        d_split = c_split[1].split("(D)")
        if len(d_split) < 2: continue
        option_c = d_split[0].strip()
        
        option_d = d_split[1].split("\n")[0].strip()
        
        if len(q_text) > 5:
            q_id = f"{current_subject.lower()}-sec1-q{len(extracted_data['questions']) + 1}"
            
            extracted_data["questions"].append({
                "id": q_id,
                "subject": current_subject,
                "section": "Section-I",
                "question_type": "MCQ",
                "question_text": q_text,
                "figures": [], # Will map figures later based on ID
                "options": [
                    {"label": "A", "text": option_a},
                    {"label": "B", "text": option_b},
                    {"label": "C", "text": option_c},
                    {"label": "D", "text": option_d}
                ],
                "correct_answer": "A",
                "marks": {"correct": 4, "incorrect": -1, "unattempted": 0}
            })
            
    # For now, just attach all found figures to Question 1 as a test
    if len(extracted_data["questions"]) > 0:
        for f in figures_list:
            extracted_data["questions"][0]["figures"].append(f["b64"])

    print(json.dumps(extracted_data))
    
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No PDF path provided"}))
        sys.exit(1)
    parse_pdf(sys.argv[1])
