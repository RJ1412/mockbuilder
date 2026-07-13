"""Sweep-line word → line grouping algorithm.

Complexity: O(N log N) dominated by the initial sort. The inner
sweep loop is amortised O(1) per word because retired lines are
never revisited.
"""

from typing import Dict, List


def group_words_into_lines(words: List[Dict]) -> List[Dict]:
    """Group word-level bounding boxes into logical text lines.

    Args:
        words: list of dicts with keys ``text``, ``top``, ``bottom``,
               ``x0``, ``x1`` (pdfplumber word format).

    Returns:
        Sorted list of line dicts with keys ``text``, ``top``,
        ``bottom``, ``x0``, ``x1``.
    """
    if not words:
        return []

    sorted_words = sorted(words, key=lambda w: (w["top"], w["x0"]))

    finished_lines: List[dict] = []
    active_lines: List[dict] = []

    for word in sorted_words:
        placed = False

        # Walk active lines newest → oldest; retire dead ones in the
        # same pass to keep the active set small.
        i = len(active_lines) - 1
        while i >= 0:
            line = active_lines[i]

            # Retire lines whose bottom is well above the current word.
            if line["bottom"] + 10 < word["top"]:
                finished_lines.append(active_lines.pop(i))
                i -= 1
                continue

            # Check vertical overlap (at least 2 PDF-pt overlap).
            overlap = min(word["bottom"], line["bottom"]) - max(
                word["top"], line["top"]
            )
            if overlap > 2:
                line["words"].append(word)
                line["top"] = min(line["top"], word["top"])
                line["bottom"] = max(line["bottom"], word["bottom"])
                placed = True
                break

            i -= 1

        if not placed:
            active_lines.append(
                {"top": word["top"], "bottom": word["bottom"], "words": [word]}
            )

    finished_lines.extend(active_lines)

    # Build output lines sorted by reading order (top → bottom).
    processed: List[Dict] = []
    for line in finished_lines:
        ws = sorted(line["words"], key=lambda w: w["x0"])
        processed.append(
            {
                "text": " ".join(w["text"] for w in ws),
                "top": line["top"],
                "bottom": line["bottom"],
                "x0": ws[0]["x0"],
                "x1": ws[-1]["x1"],
            }
        )
    return sorted(processed, key=lambda ln: ln["top"])
