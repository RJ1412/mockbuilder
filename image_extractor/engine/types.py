"""Shared data types for the extraction engine."""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass
class Candidate:
    """A raw regex match — not yet validated as a real marker.

    Instances are produced by the first-pass regex scan and then
    filtered by the sequential-validation layer. Only candidates
    with ``accepted=True`` are used for cropping.
    """
    type: str               # 'Q' (question) or 'O' (option)
    number: int             # For Q: question num. For O: ordinal (1=A … 4=D)
    label: str              # Display label: 'A','B','C','D' or 'Q5' etc.
    page: int               # 1-indexed page number
    col_idx: int            # 0 = left/single column, 1 = right column
    y_top: float            # PDF-coordinate top edge
    y_bottom: float         # PDF-coordinate bottom edge
    x0: float               # PDF-coordinate left edge
    x1: float               # PDF-coordinate right edge
    text: str               # The full line text that matched
    accepted: bool = False
    reject_reason: str = ""


@dataclass
class Section:
    """A detected section header (e.g. 'SECTION-A — Single Correct MCQ')."""
    part: str               # "Physics", "Chemistry", etc.
    label: str              # Raw label text, e.g. "SECTION-I"
    section_type: str       # Normalised: "mcq_single", "mcq_multi", "numerical", "matrix_match"
    start_page: int         # Page where the section header was found
    start_y: float          # Y-coordinate of the header line
    q_start: int = 1        # Expected first question number in this section


@dataclass
class BBox:
    """Axis-aligned bounding box in PDF coordinates."""
    x0: float
    y_top: float
    x1: float
    y_bottom: float

    def as_list(self) -> List[float]:
        return [self.x0, self.y_top, self.x1, self.y_bottom]

    def union(self, other: "BBox") -> "BBox":
        return BBox(
            x0=min(self.x0, other.x0),
            y_top=min(self.y_top, other.y_top),
            x1=max(self.x1, other.x1),
            y_bottom=max(self.y_bottom, other.y_bottom),
        )

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        return self.y_bottom - self.y_top

    @property
    def aspect_ratio(self) -> float:
        h = self.height
        return self.width / h if h > 0 else float("inf")


@dataclass
class QuestionResult:
    """The final structured output for one question."""
    question_id: str            # "Physics_SectionI_Q11"
    question_number: int        # Printed number within this section
    part: str                   # "Physics"
    section: str                # "SectionI"
    section_type: str           # "mcq_single", "mcq_multi", "numerical"
    page: int
    bbox_pdf: BBox
    bbox_px: List[int] = field(default_factory=list)
    needs_review: bool = False
    review_reason: str = ""
    confidence_notes: str = ""


@dataclass
class TemplateConfig:
    """Per-source configuration for parsing behaviour."""
    name: str
    detect_patterns: List[str]
    column_mode: str                        # "dual", "single", "auto"
    question_marker_regex: str
    part_header_patterns: List[str]
    section_header_patterns: List[str]
    section_type_keywords: Dict[str, List[str]]
    margin_top_pct: float = 0.06
    margin_bottom_pct: float = 0.04
    dpi: int = 300
    padding: int = 10
