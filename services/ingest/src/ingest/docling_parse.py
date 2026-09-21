"""Docling wrapper: extracts text blocks, tables, and figures with
page/bbox provenance. OCR is deliberately disabled here (do_ocr=False) —
ocr.py runs Tesseract instead (see that module's docstring for why), keyed
off which pages Docling found zero text items on.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc.document import PictureItem, SectionHeaderItem, TableItem, TextItem
from PIL import Image


@dataclass
class Bbox:
    x0: float
    y0: float
    x1: float
    y1: float
    crop_path: Optional[str] = None

    def to_dict(self) -> dict:
        d = {"x0": self.x0, "y0": self.y0, "x1": self.x1, "y1": self.y1}
        if self.crop_path:
            d["crop_path"] = self.crop_path
        return d


@dataclass
class Block:
    kind: str  # 'text' | 'table' | 'figure_caption'
    page: int
    bbox: Bbox
    section_path: list[str]
    text: str  # for tables: markdown; for figures: caption text (filled by chunking.py)


@dataclass
class ParsedDocument:
    page_count: int
    blocks: list[Block]
    pages_needing_ocr: set[int] = field(default_factory=set)
    page_images: dict[int, Image.Image] = field(default_factory=dict)


def _prov_bbox(item) -> Optional[Bbox]:
    if not item.prov:
        return None
    p = item.prov[0]
    b = p.bbox
    return Bbox(x0=b.l, y0=b.b, x1=b.r, y1=b.t)


def parse_document(file_path: str | Path, figures_dir: Path) -> ParsedDocument:
    opts = PdfPipelineOptions()
    opts.do_ocr = False
    opts.generate_page_images = True
    opts.generate_picture_images = True
    opts.images_scale = 2.0

    converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})
    result = converter.convert(str(file_path))
    doc = result.document

    section_stack: list[str] = []
    blocks: list[Block] = []
    pages_with_text: set[int] = set()
    figure_index = 0

    for item, _level in doc.iterate_items():
        bbox = _prov_bbox(item)
        page = item.prov[0].page_no if item.prov else 1

        if isinstance(item, SectionHeaderItem):
            # crude but adequate section-path tracking: header text becomes
            # the current path element at its own level (we don't have a
            # reliable heading-level signal from iterate_items alone, so we
            # just keep a single trailing header as the path — good enough
            # for citation display, not a full outline).
            section_stack = [item.text]
            pages_with_text.add(page)
            continue

        if isinstance(item, TextItem):
            if bbox is None:
                continue
            blocks.append(
                Block(kind="text", page=page, bbox=bbox, section_path=list(section_stack), text=item.text)
            )
            pages_with_text.add(page)

        elif isinstance(item, TableItem):
            if bbox is None:
                continue
            md = item.export_to_markdown(doc)
            blocks.append(
                Block(kind="table", page=page, bbox=bbox, section_path=list(section_stack), text=md)
            )
            pages_with_text.add(page)

        elif isinstance(item, PictureItem):
            if bbox is None:
                continue
            crop_path = None
            img = item.get_image(doc)
            if img is not None:
                figures_dir.mkdir(parents=True, exist_ok=True)
                figure_index += 1
                crop_path = str(figures_dir / f"{figure_index}.png")
                img.save(crop_path)
                bbox.crop_path = crop_path
            # Text is filled in later by chunking.py's captioning step —
            # store a placeholder block now so page/bbox/section are kept.
            blocks.append(
                Block(kind="figure_caption", page=page, bbox=bbox, section_path=list(section_stack), text="")
            )
            pages_with_text.add(page)

    page_count = len(doc.pages)
    pages_needing_ocr = {p for p in range(1, page_count + 1) if p not in pages_with_text}
    page_images = {
        pno: page.image.pil_image
        for pno, page in doc.pages.items()
        if page.image is not None and pno in pages_needing_ocr
    }

    return ParsedDocument(
        page_count=page_count,
        blocks=blocks,
        pages_needing_ocr=pages_needing_ocr,
        page_images=page_images,
    )
