# CBT Image Extractor Pipeline — v2

A robust, production-grade Python pipeline for cropping questions and options from JEE-style exam PDFs into standalone images with a structured manifest.

## Architecture

```
image_extractor/
├── server.py              ← FastAPI microservice (Supabase uploads)
├── engine/                ← Core extraction engine (no Supabase dependency)
│   ├── parser.py          ← Main orchestrator
│   ├── section_detector.py    ← Section-header detection (SECTION-A, PART-I, etc.)
│   ├── marker_validator.py    ← Sequential validation (pure functions, unit-testable)
│   ├── bbox_builder.py        ← Image+vector-aware bounding box union
│   ├── option_scoper.py       ← Tightly scoped option search
│   ├── column_splitter.py     ← Density histogram column detection
│   ├── line_grouper.py        ← Sweep-line word→line grouping
│   └── types.py               ← Shared dataclasses
├── templates/             ← Per-source configuration
│   ├── loader.py          ← Auto-detect + load templates
│   ├── allen_dlp.json     ← Allen DLP / AITS
│   ├── nta_official.json  ← NTA JEE Main/Advanced
│   └── resonance.json     ← Resonance / FIITJEE
├── review.html            ← Static local review tool (dark mode, v2)
└── requirements.txt
```

## Setup

```bash
cd d:\mockbuilder\image_extractor
py -3.11 -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Usage

### As a FastAPI microservice (production)

```bash
python -m uvicorn server:app --port 5000
```

The Next.js frontend will automatically route PDF uploads through this endpoint.

### As a CLI tool (local testing)

```bash
python extract.py --pdf path/to/test.pdf --out ./output --dpi 300
```

### Template selection

Templates are auto-detected from watermark/header text. To force a specific template:

```bash
# CLI
python extract.py --pdf test.pdf --out ./output --template "Allen DLP"

# API
POST /extract?testId=abc&template=Allen%20DLP
```

## Failure Modes — Handled vs. Manual

| Failure Mode | Handled Automatically? | Details |
|---|---|---|
| **Question numbering desync** | ✅ Yes | Sequential validation rejects false-positive sub-list numbers |
| **Incomplete/half-cropped questions** | ✅ Yes | BBox builder unions embedded images + vector drawings |
| **Options from wrong question** | ✅ Yes | Option search is strictly scoped to question's vertical extent |
| **Question type mismatch** | ✅ Yes | Section-aware parser detects MCQ/numerical/matrix from headers |
| **Numbering resets across sections** | ✅ Yes | Each section resets to Q1; global IDs are `SectionA_Q1` format |
| **Headers/footers/watermarks** | ✅ Yes | Configurable margin exclusion bands per template |
| **Assertion-Reason questions** | ✅ Yes | Body text stays in question stem; options parsed normally |
| **Matrix-match questions** | ⚠️ Partial | Detected by keywords, captured as full block, flagged for review |
| **Passage-based questions** | ⚠️ Partial | Passage attached to first sub-question; others get confidence note |
| **Scanned/rotated pages** | ❌ Manual | Detected (low word count) and flagged `needs_review=true` |
| **Negative marking / instruction blocks** | ✅ Yes | Filtered out by sequential validation (numbers don't fit the sequence) |

## Review Tool

Open `review.html` in any modern browser. Features:

- **Thumbnail grid view**: All questions shown as compact rows with thumbnails
- **Filter buttons**: All / ⚠ Flagged / ✓ OK
- **Review reason badges**: Shows specific reason (type_mismatch, missing_question_number, etc.)
- **Confirm All Non-Flagged**: One-click button to mark all clean questions as confirmed
- **Canvas crop editor**: Click "Edit Crop" to redraw any bounding box

## Adding a New Template

1. Create `templates/your_source.json` following the existing JSON structure.
2. Add `detect_patterns` (watermark/header text unique to this source).
3. Adjust `margin_top_pct`, `margin_bottom_pct`, `column_mode`, and regex patterns.
4. No Python code changes needed.
