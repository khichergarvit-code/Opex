"""OCR for pages Docling found no text layer on.

Uses Tesseract (pytesseract), not Docling's built-in RapidOCR — spiked live
against both real fixtures (see eval/corpus/): RapidOCR badly garbled the
scanned inspection report's English text (e.g. "3econ mg g g m lel" for
"3. Coupling alignment..."), while Tesseract at 2x page-image scale
transcribed it near-perfectly. The Hindi safety circular turned out to have
a real embedded text layer (reportlab-generated, not rasterized), so it
never hits this path at all in the current corpus — 'hin' is still passed
alongside 'eng' so a genuinely scanned Hindi page would be handled too.
"""

from __future__ import annotations

import pytesseract
from PIL import Image

TESSERACT_LANGS = "eng+hin"


def ocr_page(image: Image.Image) -> str:
    return pytesseract.image_to_string(image, lang=TESSERACT_LANGS).strip()
