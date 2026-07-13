"""Main PDF → QuestionResult orchestrator for V3 (ALLEN DLP).

Ties together all engine modules:
  1. Template detection / loading
  2. Page-by-page word extraction + English column isolation
  3. Section header detection (PART + SECTION)
  4. Question marker regex scan → sequential validation
  5. Combined single-crop image generation
"""

import io
import re
from typing import Dict, List, Optional, Tuple

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image

from .types import BBox, Candidate, QuestionResult, Section, TemplateConfig
from .line_grouper import group_words_into_lines
from .column_detector import find_column_divider, find_column_split
from .section_detector import detect_sections, get_active_section
from .marker_validator import validate_question_sequence
from .bbox_builder import build_full_bbox


def parse_pdf(
    pdf_bytes: bytes,
    template: Optional[TemplateConfig] = None,
) -> Tuple[List[QuestionResult], List[Image.Image]]:
    if template is None:
        template = _default_template()

    dpi = template.dpi
    scale = dpi / 72.0
    padding = template.padding

    pdf_plumber = pdfplumber.open(io.BytesIO(pdf_bytes))
    pdf_ium = pdfium.PdfDocument(pdf_bytes)

    # ------------------------------------------------------------------
    # Pass 0: Render all pages and isolate English column
    # ------------------------------------------------------------------
    all_lines_with_page: List[Dict] = []
    page_data: List[Dict] = []

    for page_num, p_page in enumerate(pdf_plumber.pages, start=1):
        words = p_page.extract_words()
        page_width = p_page.width
        page_height = p_page.height

        # Render the full page image.
        pdfium_page = pdf_ium[page_num - 1]
        bitmap = pdfium_page.render(scale=scale)
        pil_image = bitmap.to_pil()

        # Margin exclusion zones.
        margin_top = page_height * template.margin_top_pct
        margin_bottom = page_height * (1 - template.margin_bottom_pct)

        # Filter words outside margins.
        words = [
            w for w in words
            if w["top"] >= margin_top and w["bottom"] <= margin_bottom
        ]

        # Column splitting - English is the left column.
        lines_objs = getattr(p_page, "lines", []) or []
        rects_objs = getattr(p_page, "rects", []) or []
        
        divider_x = find_column_divider(lines_objs, rects_objs, page_width, page_height)
        
        if divider_x is not None:
            left_words = [w for w in words if w["x1"] < divider_x - 5]
            right_words = [w for w in words if w["x0"] > divider_x + 5]
        else:
            split_x = find_column_split(words, page_width, template.column_mode)
            if split_x is not None:
                left_words = [w for w in words if w["x1"] < split_x + 10]
                right_words = [w for w in words if w["x1"] >= split_x + 10]
            else:
                left_words = words
                right_words = []
                
        # Group columns into lines
        left_lines = group_words_into_lines(left_words)
        right_lines = group_words_into_lines(right_words)
        
        for ln in left_lines:
            ln["page"] = page_num
        for ln in right_lines:
            ln["page"] = page_num
        
        all_lines_with_page.extend(left_lines)
        all_lines_with_page.extend(right_lines)

        page_data.append({
            "page_num": page_num,
            "pil_image": pil_image,
            "p_page": p_page,
            "left_words": left_words,
            "left_lines": left_lines,
            "right_words": right_words,
            "right_lines": right_lines,
        })

    # ------------------------------------------------------------------
    # Pass 1: Detect sections.
    # ------------------------------------------------------------------
    sections = detect_sections(all_lines_with_page, template)

    # ------------------------------------------------------------------
    # Pass 2: Collect question-marker candidates.
    # ------------------------------------------------------------------
    q_regex = re.compile(template.question_marker_regex, re.IGNORECASE)

    # Group candidates by section key (part + label).
    section_candidates: Dict[str, List[Candidate]] = {f"{s.part}_{s.label}": [] for s in sections}

    for pd in page_data:
        page_num = pd["page_num"]
        for col_index, lines in enumerate([pd["left_lines"], pd["right_lines"]]):
            for line in lines:
                text = line["text"].strip()
                if q_regex.match(text):
                    num = _extract_number(text)
                    section = get_active_section(sections, page_num, line["top"])
                    section_key = f"{section.part}_{section.label}"
                    
                    if section_key in section_candidates:
                        section_candidates[section_key].append(
                            Candidate(
                                type="Q",
                                number=num,
                                label=f"Q{num}",
                                page=page_num,
                                col_idx=col_index,
                                y_top=line["top"],
                                y_bottom=line["bottom"],
                                x0=line["x0"],
                                x1=line["x1"],
                                text=text,
                            )
                        )

    # ------------------------------------------------------------------
    # Pass 3: Validate question sequences per section.
    # ------------------------------------------------------------------
    all_accepted_q: List[Tuple[Candidate, Section]] = []
    all_review_flags: List[str] = []
    
    # Process each section key only once to avoid duplicating candidates
    processed_keys = set()

    for section in sections:
        section_key = f"{section.part}_{section.label}"
        if section_key in processed_keys:
            continue
        processed_keys.add(section_key)
        
        cands = section_candidates.get(section_key, [])
        cands.sort(key=lambda c: (c.page, c.col_idx, c.y_top))
        
        print(f"Section {section_key} candidates before validation:")
        for c in cands:
            print(f"  Q{c.number} (page {c.page}, col {c.col_idx}, y={c.y_top})")
            
        accepted, flags = validate_question_sequence(cands, section)
        
        print(f"Section {section_key} candidates AFTER validation:")
        for c in accepted:
            print(f"  Q{c.number}")
            
        all_review_flags.extend(flags)
        for q in accepted:
            all_accepted_q.append((q, section))

    # Sort globally by document order.
    all_accepted_q.sort(key=lambda t: (t[0].page, t[0].col_idx, t[0].y_top))

    # ------------------------------------------------------------------
    # Pass 4: Combined BBox logic and verification
    # ------------------------------------------------------------------
    results: List[QuestionResult] = []

    current_page = -1
    prev_q_bottom_col = {0: 0.0, 1: 0.0}

    for idx, (q_cand, section) in enumerate(all_accepted_q):
        page_num = q_cand.page
        if page_num != current_page:
            current_page = page_num
            prev_q_bottom_col = {0: 0.0, 1: 0.0}
            
        q_top = max(0, q_cand.y_top - 5)

        pd = page_data[page_num - 1]
        col_words = pd["left_words"] if q_cand.col_idx == 0 else pd["right_words"]
        
        if col_words:
            # Catch floating math symbols (like integrals) that line_grouper missed
            floating_words = [w["top"] for w in col_words if w["top"] >= prev_q_bottom_col[q_cand.col_idx] and w["bottom"] <= q_cand.y_bottom + 5]
            if floating_words:
                min_floating_top = min(floating_words)
                if min_floating_top < q_top and min_floating_top >= q_cand.y_top - 40:
                    q_top = max(0, min_floating_top - 5)
        pil_image = pd["pil_image"]
        p_page = pd["p_page"]
        
        col_words = pd["left_words"] if q_cand.col_idx == 0 else pd["right_words"]
        col_lines = pd["left_lines"] if q_cand.col_idx == 0 else pd["right_lines"]
        
        if not col_words:
            continue
            
        col_x0 = min(w["x0"] for w in col_words)
        col_x1 = max(w["x1"] for w in col_words)

        next_q_top = _find_next_q_top(all_accepted_q, idx, page_num, col_words, q_cand.col_idx)
        
        # Verify MCQ options in text
        needs_review = False
        review_reason = ""
        
        stem_bottom = next_q_top
        
        has_options = False
        
        # Check for (A) (B) (C) (D) anywhere in the text below the question
        text_in_q = _get_text_in_range(col_lines, q_top, next_q_top)
        found_options = sum(1 for opt in ["(A)", "(B)", "(C)", "(D)", "(1)", "(2)", "(3)", "(4)"] if opt in text_in_q or opt.replace("(", "").replace(")", ".") in text_in_q)
        
        if found_options >= 4:
            has_options = True
        else:
            # Try extending search down a bit (e.g. 100 pts) in case options are below the next question marker
            extended_top = next_q_top + 100
            text_in_extended = _get_text_in_range(col_lines, q_top, extended_top)
            found_options_ext = sum(1 for opt in ["(A)", "(B)", "(C)", "(D)", "(1)", "(2)", "(3)", "(4)"] if opt in text_in_extended or opt.replace("(", "").replace(")", ".") in text_in_extended)
            
            if found_options_ext >= 4:
                has_options = True
                # REMOVED: stem_bottom = extended_top (This caused overlapping with the next question)
        
        # Dynamic type classification based on options presence
        dynamic_type = "mcq_single" if has_options else "numerical"
        
        if not has_options and section.section_type in ("mcq_single", "mcq_multi"):
            needs_review = True
            review_reason = "missing_options_fallback_to_numerical"
            
        text_bbox = BBox(x0=col_x0, y_top=q_top, x1=col_x1, y_bottom=stem_bottom)

        full_bbox, bbox_review, bbox_reason = build_full_bbox(
            text_bbox=text_bbox,
            page_images=getattr(p_page, "images", []) or [],
            page_rects=getattr(p_page, "rects", []) or [],
            page_lines=getattr(p_page, "lines", []) or [],
            col_x0=col_x0,
            col_x1=col_x1,
            next_q_top=stem_bottom,
        )

        # Height sanity check
        height_px = (full_bbox.y_bottom - full_bbox.y_top) * scale
        if section.section_type in ("mcq_single", "mcq_multi") and height_px < 80:
            needs_review = True
            review_reason = "crop_too_short"

        if bbox_review:
            needs_review = True
            review_reason = bbox_reason

        section_q_id = f"{section.part}_{section.label}_Q{q_cand.number}"
        for flag in all_review_flags:
            if flag.startswith("missing_question_number:"):
                needs_review = True
                review_reason = "missing_question_number"

        q_bbox_px = _pdf_to_px(full_bbox, scale, padding, pil_image)

        results.append(
            QuestionResult(
                question_id=section_q_id,
                question_number=q_cand.number,
                part=section.part,
                section=section.label,
                section_type=dynamic_type,
                page=page_num,
                bbox_pdf=full_bbox,
                bbox_px=q_bbox_px,
                needs_review=needs_review,
                review_reason=review_reason,
                confidence_notes="",
            )
        )
        prev_q_bottom_col[q_cand.col_idx] = full_bbox.y_bottom

    page_images = [pd["pil_image"] for pd in page_data]
    return results, page_images


def _extract_number(text: str) -> int:
    m = re.search(r"\d+", text)
    return int(m.group()) if m else 0


def _find_next_q_top(
    all_q: List[Tuple[Candidate, Section]],
    current_idx: int,
    page: int,
    col_words: List[Dict],
    col_idx: int,
) -> float:
    for j in range(current_idx + 1, len(all_q)):
        next_q, _ = all_q[j]
        if next_q.page == page and getattr(next_q, "col_idx", 0) == col_idx:
            return next_q.y_top
    if col_words:
        return max(w["bottom"] for w in col_words)
    return 842.0


def _get_text_in_range(lines: List[Dict], y_top: float, y_bottom: float) -> str:
    texts = []
    for ln in lines:
        if y_top - 5 <= ln["top"] <= y_bottom + 5:
            texts.append(ln["text"])
    return " ".join(texts)


def _pdf_to_px(bbox: BBox, scale: float, padding: int, pil_image: Image.Image) -> List[int]:
    return [
        max(0, int(bbox.x0 * scale) - padding),
        max(0, int(bbox.y_top * scale) - padding),
        min(pil_image.width, int(bbox.x1 * scale) + padding),
        min(pil_image.height, int(bbox.y_bottom * scale) + padding),
    ]


def _default_template() -> TemplateConfig:
    return TemplateConfig(
        name="ALLEN DLP Default",
        detect_patterns=["ALLEN", "DLP"],
        column_mode="dual",
        question_marker_regex=r"^(?:Q\.?\s*|Question\s*)?\d+[\.\)]\s",
        part_header_patterns=[r"PART\s*[-–]?\s*[A-Z0-9IViv]+"],
        section_header_patterns=[r"SECTION\s*[-–]?\s*[A-Z]"],
        section_type_keywords={
            "mcq_single": ["Single Correct", "one correct", "Only One", "Single Choice"],
            "mcq_multi": ["More Than One", "Multiple Correct", "one or more", "Multi Correct"],
            "numerical": ["Numerical", "Integer", "Numeric", "Integer Type"],
            "matrix_match": ["Match", "Column I", "Column II", "Matrix"]
        },
        margin_top_pct=0.08,
        margin_bottom_pct=0.08,
        dpi=300,
        padding=15,
    )
