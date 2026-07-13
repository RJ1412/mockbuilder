"""Template loader with auto-detection.

Loads JSON template configs from the ``templates/`` directory and
can auto-detect which template matches a given PDF by scanning the
first few pages for watermark/header text.
"""

import io
import json
import os
import re
from pathlib import Path
from typing import List, Optional

import pdfplumber

from engine.types import TemplateConfig


_TEMPLATES_DIR = Path(__file__).parent


def load_all_templates() -> List[TemplateConfig]:
    """Load every ``.json`` file in the templates directory."""
    templates: List[TemplateConfig] = []
    for fp in sorted(_TEMPLATES_DIR.glob("*.json")):
        with open(fp, "r", encoding="utf-8") as f:
            data = json.load(f)
        templates.append(_dict_to_config(data))
    return templates


def load_template_by_name(name: str) -> Optional[TemplateConfig]:
    """Load a specific template by its ``name`` field (case-insensitive)."""
    for t in load_all_templates():
        if t.name.lower() == name.lower():
            return t
    return None


def auto_detect_template(
    pdf_bytes: bytes,
    max_pages: int = 3,
) -> Optional[TemplateConfig]:
    """Scan the first ``max_pages`` of a PDF for template markers.

    Returns the first matching template, or ``None`` if no match.
    """
    templates = load_all_templates()
    if not templates:
        return None

    pdf = pdfplumber.open(io.BytesIO(pdf_bytes))
    pages_text: List[str] = []

    for i, page in enumerate(pdf.pages):
        if i >= max_pages:
            break
        text = page.extract_text() or ""
        pages_text.append(text)

    full_text = "\n".join(pages_text)

    for tmpl in templates:
        for pattern in tmpl.detect_patterns:
            if re.search(re.escape(pattern), full_text, re.IGNORECASE):
                return tmpl

    return None


def resolve_template(
    pdf_bytes: bytes,
    template_name: Optional[str] = None,
) -> TemplateConfig:
    """Resolve the template to use: explicit name > auto-detect > default.

    Args:
        pdf_bytes: raw PDF for auto-detection.
        template_name: explicit template name (from ``--template`` CLI
                       arg or API query param).

    Returns:
        A ``TemplateConfig`` instance.

    Raises:
        ValueError: if an explicit name was given but not found.
    """
    if template_name:
        tmpl = load_template_by_name(template_name)
        if tmpl:
            return tmpl
        available = [t.name for t in load_all_templates()]
        raise ValueError(
            f"Template '{template_name}' not found. "
            f"Available: {available}"
        )

    detected = auto_detect_template(pdf_bytes)
    if detected:
        print(f"Auto-detected template: {detected.name}")
        return detected

    # Fallback: parser.py's _default_template() will be used.
    print("No template matched. Using generic defaults.")
    return None


def _dict_to_config(d: dict) -> TemplateConfig:
    return TemplateConfig(
        name=d["name"],
        detect_patterns=d.get("detect_patterns", []),
        column_mode=d.get("column_mode", "auto"),
        question_marker_regex=d.get(
            "question_marker_regex", r"^(?:Q\.?\s*|Question\s*)?\d+[\.\)]\s"
        ),
        part_header_patterns=d.get("part_header_patterns", []),
        section_header_patterns=d.get("section_header_patterns", []),
        section_type_keywords=d.get("section_type_keywords", {}),
        margin_top_pct=d.get("margin_top_pct", 0.06),
        margin_bottom_pct=d.get("margin_bottom_pct", 0.04),
        dpi=d.get("dpi", 300),
        padding=d.get("padding", 10),
    )
