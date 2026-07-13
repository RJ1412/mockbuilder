"""Image-and-vector-aware bounding-box builder.

Fix 3: don't rely on text bounding boxes alone.  Also pull embedded
images (``page.images``), vector rectangles (``page.rects``), and
lines (``page.lines``) that fall within the question's column and
vertical range, and union them into the final bbox.
"""

from typing import Dict, List, Optional

from .types import BBox


# Minimum crop height at 300 DPI (in PDF points, ≈ 13 pt ≈ 4.6 mm).
_MIN_HEIGHT_PT = 13.0
# Maximum reasonable aspect ratio before flagging.
_MAX_ASPECT_RATIO = 15.0


def build_full_bbox(
    text_bbox: BBox,
    page_images: List[Dict],
    page_rects: List[Dict],
    page_lines: List[Dict],
    col_x0: float,
    col_x1: float,
    next_q_top: Optional[float],
) -> tuple:
    """Compute the final bounding box, including any embedded media.

    Args:
        text_bbox: the bbox derived from text markers alone.
        page_images: ``pdfplumber_page.images`` list.
        page_rects: ``pdfplumber_page.rects`` list.
        page_lines: ``pdfplumber_page.lines`` list.
        col_x0: left edge of the active column.
        col_x1: right edge of the active column.
        next_q_top: y_top of the next question in the same column
                    (used as a soft upper bound — images are allowed
                    to spill past it, but text markers are not).
                    ``None`` if this is the last question on the page.

    Returns:
        ``(final_bbox, needs_review, review_reason)`` tuple.
    """
    final = text_bbox
    needs_review = False
    review_reason = ""

    # --- Embedded raster images ---
    for img in page_images:
        img_bbox = _image_to_bbox(img)
        if img_bbox and _overlaps_column(img_bbox, col_x0, col_x1):
            if _within_vertical_range(img_bbox, text_bbox.y_top, next_q_top):
                final = final.union(img_bbox)

    # --- Vector rectangles (common in chemistry structures, tables) ---
    for rect in page_rects:
        r_bbox = _rect_to_bbox(rect)
        if r_bbox and _overlaps_column(r_bbox, col_x0, col_x1):
            if _within_vertical_range(r_bbox, text_bbox.y_top, next_q_top):
                final = final.union(r_bbox)

    # --- Vector lines (circuit diagrams, graphs) ---
    # Group nearby lines into a composite bbox to avoid extending
    # the crop for a single stray horizontal rule.
    line_bboxes = []
    for ln in page_lines:
        l_bbox = _line_to_bbox(ln)
        if l_bbox and _overlaps_column(l_bbox, col_x0, col_x1):
            if _within_vertical_range(l_bbox, text_bbox.y_top, next_q_top):
                line_bboxes.append(l_bbox)

    if len(line_bboxes) >= 3:
        # Multiple lines → likely a real diagram; union them all.
        composite = line_bboxes[0]
        for lb in line_bboxes[1:]:
            composite = composite.union(lb)
        final = final.union(composite)

    # --- Sanity checks ---
    if final.height < _MIN_HEIGHT_PT:
        needs_review = True
        review_reason = "low_confidence_bbox"

    if final.aspect_ratio > _MAX_ASPECT_RATIO:
        needs_review = True
        review_reason = "low_confidence_bbox"

    return final, needs_review, review_reason


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _image_to_bbox(img: Dict) -> Optional[BBox]:
    """Convert a pdfplumber image dict to a BBox."""
    try:
        return BBox(
            x0=float(img["x0"]),
            y_top=float(img["top"]),
            x1=float(img["x1"]),
            y_bottom=float(img["bottom"]),
        )
    except (KeyError, TypeError):
        return None


def _rect_to_bbox(rect: Dict) -> Optional[BBox]:
    """Convert a pdfplumber rect dict to a BBox."""
    try:
        return BBox(
            x0=float(rect["x0"]),
            y_top=float(rect["top"]),
            x1=float(rect["x1"]),
            y_bottom=float(rect["bottom"]),
        )
    except (KeyError, TypeError):
        return None


def _line_to_bbox(ln: Dict) -> Optional[BBox]:
    """Convert a pdfplumber line dict to a BBox."""
    try:
        return BBox(
            x0=min(float(ln["x0"]), float(ln.get("x1", ln["x0"]))),
            y_top=min(float(ln["top"]), float(ln.get("bottom", ln["top"]))),
            x1=max(float(ln["x0"]), float(ln.get("x1", ln["x0"]))),
            y_bottom=max(float(ln["top"]), float(ln.get("bottom", ln["top"]))),
        )
    except (KeyError, TypeError):
        return None


def _overlaps_column(bbox: BBox, col_x0: float, col_x1: float) -> bool:
    """Check if a bbox's horizontal centre falls within the column."""
    centre = (bbox.x0 + bbox.x1) / 2.0
    
    # Check if the centre is within the column
    if not (col_x0 - 10 <= centre <= col_x1 + 10):
        return False
        
    # If the bbox spills massively out of the right side of the column (e.g. into the next column), reject it
    if bbox.x1 > col_x1 + 75:
        return False
        
    return True


def _within_vertical_range(
    bbox: BBox,
    q_top: float,
    next_q_top: Optional[float],
) -> bool:
    """Check if a bbox starts within the question's vertical range.

    We allow it to *end* below ``next_q_top`` (diagrams spilling into
    whitespace before the next question), but it must *start* within
    the question's own extent.
    """
    # The object must not end completely above the question
    if bbox.y_bottom < q_top:
        return False
        
    # The object must not start excessively high above the question 
    # (to avoid absorbing diagrams from the previous question).
    # 40pt allows for tall math equations/matrices.
    if bbox.y_top < q_top - 40:
        return False

    # If there's a next question, the object must start before the
    # next question's top. We use a small 5pt margin in case of slight overlap,
    # but it cannot start below the next question.
    if next_q_top is not None and bbox.y_top >= next_q_top - 5:
        return False

    # Prevent very tall objects (like column dividers or borders) that start 
    # in this question from extending far into the next question(s)
    if next_q_top is not None and bbox.y_bottom > next_q_top + 30:
        return False

    return True
