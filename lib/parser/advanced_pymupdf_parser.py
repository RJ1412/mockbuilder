import fitz  # PyMuPDF
import sys
import base64
import json
import re

# Unicode maps for sub/superscripts
SUPERSCRIPTS = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'n': 'ⁿ', 'i': 'ⁱ'
}
SUBSCRIPTS = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
    'x': 'ₓ'
}

def to_superscript(text: str) -> str:
    return ''.join(SUPERSCRIPTS.get(c, c) for c in text)

def to_subscript(text: str) -> str:
    return ''.join(SUBSCRIPTS.get(c, c) for c in text)

def is_superscript(span, modal_size, line_baseline):
    if span['size'] < 0.85 * modal_size and span['origin'][1] < line_baseline - 1:
        return True
    return False

def is_subscript(span, modal_size, line_baseline):
    if span['size'] < 0.85 * modal_size and span['origin'][1] > line_baseline + 1:
        return True
    return False

def get_figures_for_page(page, page_width):
    # Cluster vector drawings
    drawings = page.get_drawings()
    clusters = []
    
    for draw in drawings:
        bbox = draw.get("rect", None)
        if not bbox: continue
        r = fitz.Rect(bbox)
        
        # Ignore full-width lines (e.g. horizontal rules)
        if r.width > 0.85 * page_width and r.height < 3:
            continue
            
        merged = False
        for cluster in clusters:
            # If drawing overlaps or is very close (e.g., within 15pt) to an existing cluster
            expanded_cluster = cluster.copy()
            expanded_cluster.add_margin(15)
            if r.intersects(expanded_cluster):
                cluster.include_rect(r)
                merged = True
                break
        if not merged:
            clusters.append(fitz.Rect(r))
            
    # Also find non-repeating raster images (basic heuristic: filter out known logo sizes or positions if needed)
    # For now, we just add embedded images to the candidate list
    img_list = page.get_image_info()
    for img in img_list:
        r = fitz.Rect(img["bbox"])
        # If it's a huge banner, skip it (e.g. height > 100, width > 500)
        if r.width > 500 and r.height > 100: continue
        
        merged = False
        for cluster in clusters:
            expanded = cluster.copy()
            expanded.add_margin(15)
            if r.intersects(expanded):
                cluster.include_rect(r)
                merged = True
                break
        if not merged:
            clusters.append(r)
            
    return clusters

def extract_questions_from_pdf(buffer_bytes: bytes):
    doc = fitz.open(stream=buffer_bytes, filetype="pdf")
    
    questions = []
    current_question = None
    current_option = None
    
    # regex for question start e.g. "1. " or "2. "
    q_re = re.compile(r'^\s*(\d{1,2})\.\s')
    # regex for option start e.g. "(A) "
    opt_re = re.compile(r'^\s*\(([A-D])\)\s')
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        rect = page.rect
        page_width = rect.width
        page_height = rect.height
        
        # 1. Figure regions detection
        figure_bboxes = get_figures_for_page(page, page_width)
        figures_processed = [] # To keep track of which figures were assigned
        
        # 2. Text extraction
        text_dict = page.get_text("dict")
        blocks = text_dict.get("blocks", [])
        
        all_spans = []
        for block in blocks:
            if block.get("type") != 0: continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    b_rect = fitz.Rect(span["bbox"])
                    
                    # Strip headers / footers
                    if b_rect.y0 < 0.08 * page_height or b_rect.y1 > 0.90 * page_height:
                        continue
                        
                    # Bilingual split: keep only the English side (usually left column, x0 < midpoint)
                    if b_rect.x0 > page_width * 0.55:
                        continue
                    
                    all_spans.append(span)
                    
        # Cluster spans into lines by y0 (within 4pt tolerance)
        all_spans.sort(key=lambda s: s["bbox"][1])
        clustered_lines = []
        for span in all_spans:
            span_y0 = span["bbox"][1]
            placed = False
            for line in clustered_lines:
                avg_y0 = sum(s["bbox"][1] for s in line) / len(line)
                if abs(span_y0 - avg_y0) <= 4.0:
                    line.append(span)
                    placed = True
                    break
            if not placed:
                clustered_lines.append([span])
                
        # Reconstruct clean_lines
        clean_lines = []
        for line in clustered_lines:
            line.sort(key=lambda s: s["bbox"][0])
            
            sizes = [s["size"] for s in line]
            baselines = [s["origin"][1] for s in line]
            if not sizes: continue
            
            modal_size = max(set(sizes), key=sizes.count)
            line_baseline = sum(baselines)/len(baselines)
            
            line_text = ""
            for span in line:
                text = span["text"]
                # If there's a gap between spans, add a space
                # Simple heuristic: if this span's x0 is > last span's x1 + 2pt, add space
                # But since we are concatenating, let's just add space if it doesn't end in space
                if line_text and not line_text.endswith(" ") and not text.startswith(" "):
                    line_text += " "
                    
                if is_superscript(span, modal_size, line_baseline):
                    # Remove trailing space before superscript
                    line_text = line_text.rstrip()
                    line_text += to_superscript(text)
                elif is_subscript(span, modal_size, line_baseline):
                    line_text = line_text.rstrip()
                    line_text += to_subscript(text)
                else:
                    line_text += text
                    
            clean_lines.append({
                "text": line_text.strip(),
                "y0": sum(s["bbox"][1] for s in line) / len(line),
                "bbox": fitz.Rect(line[0]["bbox"][0], min(s["bbox"][1] for s in line), line[-1]["bbox"][2], max(s["bbox"][3] for s in line))
            })
            
        clean_lines.sort(key=lambda l: l["y0"])
        
        # 3. Parsing logic (Questions and Options)
        for line_obj in clean_lines:
            line_str = line_obj["text"]
            line_bbox = line_obj["bbox"]
            
            # Check if this line starts a new question
            q_match = q_re.match(line_str)
            if q_match:
                if current_question and current_question["questionText"].strip():
                    questions.append(current_question)
                
                q_no = int(q_match.group(1))
                current_question = {
                    "questionNo": q_no,
                    "questionText": line_str[q_match.end():].strip() + " ",
                    "figures": [],
                    "options": {"A": {"text": "", "figure": None}, "B": {"text": "", "figure": None}, 
                                "C": {"text": "", "figure": None}, "D": {"text": "", "figure": None}},
                    "type": "MCQ"
                }
                current_option = None
                continue
                
            # Check if this line starts a new option
            opt_match = opt_re.match(line_str)
            if opt_match and current_question:
                opt_label = opt_match.group(1)
                current_option = opt_label
                current_question["options"][current_option]["text"] += line_str[opt_match.end():].strip() + " "
                continue
                
            # Append text to ongoing question or option
            if current_option and current_question:
                current_question["options"][current_option]["text"] += line_str + " "
            elif current_question:
                current_question["questionText"] += line_str + " "
                
        # 4. Associate figures with the current parsed state on this page
        for fig_bbox in figure_bboxes:
            # Render figure
            fig_bbox.add_margin(5) # 5pt padding
            pix = page.get_pixmap(clip=fig_bbox, dpi=200)
            
            # Ignore if blank/near-white
            # Simple heuristic: if pixel variance is very low, it's blank
            if pix.width < 10 or pix.height < 10: continue
            
            img_b64 = base64.b64encode(pix.tobytes("png")).decode("utf-8")
            
            # Associate to option or question based on y-overlap or proximity
            # If we don't have a specific option overlapping, default to the last seen question
            assigned = False
            if current_question:
                # In a real rigorous pass, we'd check bbox overlaps precisely.
                # Since we linearize, if it's vertically in the bounds of an option, assign it there.
                # For simplicity, assign to question figure array.
                current_question["figures"].append(f"data:image/png;base64,{img_b64}")
                assigned = True

    if current_question and current_question["questionText"].strip():
        questions.append(current_question)
        
    doc.close()
    
    # Post-process cleanup
    results = []
    for q in questions:
        # Determine if it's NVA (Numerical Value Answer) based on options being empty
        is_nva = all(len(o["text"].strip()) == 0 and o["figure"] is None for o in q["options"].values())
        if is_nva:
            q["type"] = "NVA"
            q["options"] = None
        else:
            q["type"] = "MCQ"
            
        results.append({
            "questionNo": q["questionNo"],
            "questionText": q["questionText"].strip(),
            "type": q["type"],
            "figures": q["figures"],
            "options": q["options"] if q["options"] else None,
        })
        
    return results

if __name__ == "__main__":
    # Test stub
    pass
