"""Sequential validation of question markers.

Fix 4 from the V3 spec: instead of trusting every regex match as a
real boundary, we validate that question numbers form an
incrementing sequence.
"""

from typing import List, Tuple

from .types import Candidate, Section


def validate_question_sequence(
    candidates: List[Candidate],
    section: Section,
    max_gap_pts: float = 100.0,
) -> Tuple[List[Candidate], List[str]]:
    """Accept only candidates whose numbers form a strict +1 sequence.

    Args:
        candidates: raw Q-type candidates sorted by ``(page, y_top)``.
        section: the active section (provides ``q_start``).
        max_gap_pts: if the expected number is missing across a
                     vertical gap larger than this many PDF points,
                     skip and flag rather than rejecting everything
                     downstream.

    Returns:
        A tuple of ``(accepted_candidates, review_flags)``.
        ``review_flags`` contains strings like
        ``"missing_question_number:5"`` for each skipped number.
    """
    if not candidates:
        return [], []

    accepted: List[Candidate] = []
    flags: List[str] = []
    expected = section.q_start

    for cand in candidates:
        if cand.number == expected:
            cand.accepted = True
            accepted.append(cand)
            expected += 1
        elif cand.number > expected:
            # A jump — possibly the PDF skipped a question.
            # Check the vertical distance from the last accepted
            # candidate to this one.
            if accepted:
                prev = accepted[-1]
                gap = _vertical_distance(prev, cand)
            else:
                gap = max_gap_pts + 1  # No prior → always allow

            if gap > max_gap_pts:
                # Large gap: the missing number(s) are genuinely absent.
                for missing in range(expected, cand.number):
                    flags.append(f"missing_question_number:{missing}")
                cand.accepted = True
                accepted.append(cand)
                expected = cand.number + 1
            else:
                # Small gap: this is likely a false positive (sub-list
                # numbering, assertion-reason "1)/2)" text, etc.)
                cand.accepted = False
                cand.reject_reason = "out_of_sequence"
        else:
            # number < expected → duplicate or earlier number re-appearing.
            cand.accepted = False
            cand.reject_reason = "out_of_sequence"

    return accepted, flags


def _vertical_distance(a: Candidate, b: Candidate) -> float:
    """Vertical distance between two candidates (may span pages)."""
    if a.page == b.page:
        return abs(b.y_top - a.y_bottom)
    # Cross-page: treat as large gap.
    return 1000.0
