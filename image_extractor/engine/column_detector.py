"""Column detection and splitting for bilingual formats.

Replaces the V2 density-histogram approach. Directly scans for the
printed vertical line that divides the English (left) and Hindi (right) columns.
"""

from typing import Dict, List, Optional


def find_column_divider(
    lines: List[Dict],
    rects: List[Dict],
    page_width: float,
    page_height: float,
) -> Optional[float]:
    """Find the X-coordinate of the vertical line dividing two columns.

    Args:
        lines: pdfplumber page.lines.
        rects: pdfplumber page.rects.
        page_width: width of the page in PDF points.
        page_height: height of the page in PDF points.

    Returns:
        The X-coordinate of the divider line, or None if not found.
    """
    candidates = []

    # Check vector lines
    for line in lines:
        x0, y0, x1, y1 = line["x0"], line["top"], line["x1"], line["bottom"]
        width = abs(x1 - x0)
        height = abs(y1 - y0)
        # Vertical line: narrow width, significant height
        if width < 5 and height > page_height * 0.3:
            candidates.append(min(x0, x1) + width / 2)

    # Check vector rects (sometimes drawn as very thin filled rectangles)
    for rect in rects:
        x0, y0, x1, y1 = rect["x0"], rect["top"], rect["x1"], rect["bottom"]
        width = abs(x1 - x0)
        height = abs(y1 - y0)
        if width < 5 and height > page_height * 0.3:
            candidates.append(x0 + width / 2)

    if not candidates:
        return None

    # Filter candidates to the middle 30% of the page
    center_lo = page_width * 0.35
    center_hi = page_width * 0.65

    valid_candidates = [c for c in candidates if center_lo <= c <= center_hi]

    if not valid_candidates:
        return None

    # If multiple, take the longest/most central one (or just the median)
    valid_candidates.sort()
    return valid_candidates[len(valid_candidates) // 2]


def find_column_split(
    words: List[Dict],
    page_width: float,
    column_mode: str = "auto",
) -> Optional[float]:
    """Fallback histogram column splitter for generic templates."""
    if column_mode == "single":
        return None

    if not words:
        return page_width / 2.0 if column_mode == "dual" else None

    max_x = max(w["x1"] for w in words)
    num_buckets = int(max_x) + 1
    buckets = [0] * num_buckets

    for w in words:
        lo = max(0, int(w["x0"]))
        hi = min(num_buckets - 1, int(w["x1"]))
        for x in range(lo, hi + 1):
            buckets[x] += 1

    search_lo = int(max_x * 0.35)
    search_hi = int(max_x * 0.65)

    best_gap_len = 0
    best_gap_start = search_lo
    cur_gap_len = 0
    cur_gap_start = search_lo

    for x in range(search_lo, search_hi):
        window_lo = max(0, x - 2)
        window_hi = min(num_buckets, x + 3)
        window_sum = sum(buckets[window_lo:window_hi])

        if window_sum == 0:
            cur_gap_len += 1
        else:
            if cur_gap_len > best_gap_len:
                best_gap_len = cur_gap_len
                best_gap_start = cur_gap_start
            cur_gap_len = 0
            cur_gap_start = x + 1

    if cur_gap_len > best_gap_len:
        best_gap_len = cur_gap_len
        best_gap_start = cur_gap_start

    min_gap = 10
    if best_gap_len >= min_gap:
        return best_gap_start + best_gap_len / 2.0

    if column_mode == "dual":
        return page_width / 2.0

    return None
