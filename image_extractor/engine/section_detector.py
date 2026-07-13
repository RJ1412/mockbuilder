"""Section-header detection and active-section tracking.

Scans page text for section headers like "SECTION-I (Single Correct MCQ)"
and part headers like "PART-A : PHYSICS". Maintains a running pointer so
every question is tagged with its part and section type.
"""

import re
from typing import Dict, List

from .types import Section, TemplateConfig


def detect_sections(
    all_lines: List[Dict],
    template: TemplateConfig,
) -> List[Section]:
    part_patterns = [
        re.compile(p, re.IGNORECASE) 
        for p in getattr(template, "part_header_patterns", [])
    ]
    section_patterns = [
        re.compile(p, re.IGNORECASE) 
        for p in template.section_header_patterns
    ]

    sections: List[Section] = []
    active_part = "General"

    for line in all_lines:
        text = line["text"].strip()
        page = line["page"]
        y_top = line["top"]

        # 1. Check for PART header
        part_matched = False
        for pat in part_patterns:
            if pat.search(text):
                active_part = _extract_part_label(text)
                part_matched = True
                break
                
        # 2. Check for SECTION header
        for pat in section_patterns:
            if pat.search(text):
                section_type = _classify_section(text, template)
                label = _extract_section_label(text)

                sections.append(
                    Section(
                        part=active_part,
                        label=label,
                        section_type=section_type,
                        start_page=page,
                        start_y=y_top,
                        q_start=1,
                    )
                )
                break

    if not sections:
        return [
            Section(
                part="General",
                label="Section_1",
                section_type="mcq_single",
                start_page=1,
                start_y=0.0,
                q_start=1,
            )
        ]

    return sorted(sections, key=lambda s: (s.start_page, s.start_y))


def get_active_section(
    sections: List[Section],
    page: int,
    y: float,
) -> Section:
    active = sections[0]
    for s in sections:
        if (s.start_page, s.start_y) <= (page, y):
            active = s
        else:
            break
    return active


def _classify_section(text: str, template: TemplateConfig) -> str:
    text_lower = text.lower()
    for stype in ("numerical", "mcq_multi", "matrix_match", "mcq_single"):
        keywords = template.section_type_keywords.get(stype, [])
        for kw in keywords:
            if kw.lower() in text_lower:
                return stype
    return "mcq_single"


def _extract_part_label(text: str) -> str:
    # "PART-A : PHYSICS" -> "Physics"
    m = re.search(r"PART\s*[-–]?\s*[A-Z0-9IViv]+\s*[:\-]*\s*([A-Za-z]+)", text, re.IGNORECASE)
    if m:
        return m.group(1).strip().capitalize()
    
    m = re.search(r"PART\s*[-–]?\s*[A-Z0-9IViv]+", text, re.IGNORECASE)
    if m:
        return m.group(0).strip().upper().replace(" ", "_")
        
    return text[:20].strip().capitalize()


def _extract_section_label(text: str) -> str:
    m = re.search(r"SECTION\s*[-–]?\s*[A-Z0-9IViv]+", text, re.IGNORECASE)
    if m:
        return m.group(0).strip().upper().replace(" ", "_").replace("–", "-")
    return text[:20].strip().upper().replace(" ", "_")
