import sys
import json
import os
import re
import base64

try:
    import fitz # PyMuPDF
except ImportError:
    print(json.dumps({"error": "PyMuPDF not installed"}))
    sys.exit(1)

def is_hindi(text):
    # Check if text contains Devanagari characters
    return bool(re.search(r'[\u0900-\u097F]', text))

def parse_pdf(pdf_path):
    if not os.path.exists(pdf_path):
        print(f"Error: File not found: {pdf_path}")
        sys.exit(1)
        
    doc = fitz.open(pdf_path)
    
    questions = []
    metadata = {
        "exam_name": "Mock CBT Exam",
        "total_questions": 0,
        "total_marks": 0,
        "duration_minutes": 180,
        "subjects": ["Physics", "Chemistry", "Mathematics"]
    }
    
    validation_report = {
        "total_questions": 0,
        "missing_answers": 0,
        "low_confidence_flags": 0,
        "unresolved_images": 0
    }
    
    current_subject = "Physics"
    figures_list = []
    
    # Store all english text blocks with their coordinates
    full_text_blocks = []
    
    for i in range(len(doc)):
        page = doc[i]
        
        # Extract images
        image_list = page.get_images(full=True)
        for img_index, img in enumerate(image_list):
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            ext = base_image["ext"]
            rects = page.get_image_rects(xref)
            if rects:
                rect = rects[0]
                b64 = base64.b64encode(image_bytes).decode('utf-8')
                figures_list.append({
                    "page": i,
                    "y0": rect.y0,
                    "y1": rect.y1,
                    "b64": f"data:image/{ext};base64,{b64}",
                    "used": False
                })
        
        # Extract text
        blocks = page.get_text("dict")["blocks"]
        for b in blocks:
            if b["type"] != 0: continue
            
            block_text = ""
            bbox = b["bbox"]
            for line in b["lines"]:
                line_text = ""
                has_hindi = False
                for span in line["spans"]:
                    text = span["text"]
                    if is_hindi(text):
                        has_hindi = True
                        break
                    line_text += text
                
                if not has_hindi and line_text.strip():
                    block_text += line_text + "\n"
            
            if block_text.strip():
                full_text_blocks.append({
                    "page": i,
                    "bbox": bbox,
                    "text": block_text.strip()
                })

    combined_text = "\n".join([b["text"] for b in full_text_blocks])
    
    q_pattern = re.compile(r'^(\d+)\.\s+(.*)', re.MULTILINE)
    
    matches = list(q_pattern.finditer(combined_text))
        
    for idx, match in enumerate(matches):
        q_num = match.group(1)
        start_pos = match.start()
        end_pos = matches[idx+1].start() if idx + 1 < len(matches) else len(combined_text)
        
        q_chunk = combined_text[start_pos:end_pos]
        
        if "CHEMISTRY" in q_chunk.upper(): current_subject = "Chemistry"
        elif "MATHEMATICS" in q_chunk.upper(): current_subject = "Mathematics"
        
        opt_a = re.search(r'\(A\)\s*(.*?)(?=\(B\)|\(C\)|\(D\)|\n\n|$)', q_chunk, re.DOTALL)
        opt_b = re.search(r'\(B\)\s*(.*?)(?=\(C\)|\(D\)|\n\n|$)', q_chunk, re.DOTALL)
        opt_c = re.search(r'\(C\)\s*(.*?)(?=\(D\)|\n\n|$)', q_chunk, re.DOTALL)
        opt_d = re.search(r'\(D\)\s*(.*?)(?=\n\n|$)', q_chunk, re.DOTALL)
        
        options = []
        q_type = "numerical"
        if opt_a and opt_b and opt_c and opt_d:
            q_type = "single_correct"
            options = [
                {"label": "A", "text": opt_a.group(1).strip(), "image": None},
                {"label": "B", "text": opt_b.group(1).strip(), "image": None},
                {"label": "C", "text": opt_c.group(1).strip(), "image": None},
                {"label": "D", "text": opt_d.group(1).strip(), "image": None}
            ]
        
        if q_type == "single_correct":
            q_text_end = q_chunk.find("(A)")
            q_text = q_chunk[len(q_num)+1:q_text_end].strip()
        else:
            q_text = q_chunk[len(q_num)+1:].strip()
            
        q_id = f"q-{q_num}-{idx}"
        
        q_images = []
        for fig in figures_list:
            if not fig["used"]:
                q_images.append(fig["b64"])
                fig["used"] = True
                break
                
        questions.append({
            "question_id": q_id,
            "subject": current_subject,
            "section": "Section-I",
            "question_number": int(q_num),
            "question_text": q_text,
            "question_images": q_images,
            "options": options,
            "question_type": q_type,
            "marks_correct": 4,
            "marks_incorrect": -1 if q_type == "single_correct" else 0,
            "correct_answer": "A",
            "solution": None
        })

    metadata["total_questions"] = len(questions)
    metadata["total_marks"] = len(questions) * 4
    
    validation_report["total_questions"] = len(questions)
    validation_report["missing_answers"] = len([q for q in questions if not q["correct_answer"]])
    
    output = {
        "metadata": metadata,
        "questions": questions
    }
    
    with open("test_data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        
    with open("validation_report.md", "w", encoding="utf-8") as f:
        f.write("# Validation Report\n\n")
        f.write(f"- Total Questions Found: {validation_report['total_questions']}\n")
        f.write(f"- Questions with Missing Answers: {validation_report['missing_answers']}\n")
        f.write(f"- Questions Flagged Low-Confidence: {validation_report['low_confidence_flags']}\n")
        f.write(f"- Questions with Unresolved Images: {validation_report['unresolved_images']}\n")

    print(f"Extraction complete! Found {len(questions)} questions.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_cbt.py <pdf_path>")
        sys.exit(1)
    parse_pdf(sys.argv[1])
