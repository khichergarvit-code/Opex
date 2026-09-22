from ingest.chunking import MAX_TOKENS, MIN_TOKENS, chunk_blocks, estimate_tokens
from ingest.docling_parse import Bbox, Block


def _text_block(text: str, page: int = 1) -> Block:
    return Block(kind="text", page=page, bbox=Bbox(0, 0, 1, 1), section_path=["Intro"], text=text)


def _table_block(md: str, page: int = 1) -> Block:
    return Block(kind="table", page=page, bbox=Bbox(0, 0, 1, 1), section_path=["Specs"], text=md)


def test_chunks_stay_within_the_target_band():
    long_text = " ".join(f"This is sentence number {i} in a long document." for i in range(200))
    chunks = chunk_blocks([_text_block(long_text)])
    text_chunks = [c for c in chunks if c.kind == "text"]
    assert len(text_chunks) > 1
    for c in text_chunks[:-1]:  # last chunk may be short (end of input)
        tokens = estimate_tokens(c.text)
        # The flush threshold sums per-sentence rounded estimates, but this
        # re-estimates the joined text in one round() call — a few tokens
        # of drift either way is expected from a word-count heuristic, not
        # exact BPE (see chunking.py's docstring).
        assert MIN_TOKENS - 10 <= tokens <= MAX_TOKENS + 50


def test_consecutive_chunks_overlap():
    long_text = " ".join(f"This is sentence number {i} in a long document." for i in range(200))
    chunks = chunk_blocks([_text_block(long_text)])
    text_chunks = [c for c in chunks if c.kind == "text"]
    assert len(text_chunks) >= 2
    # the start of chunk 2 should reuse some tail content from chunk 1
    first_tail = " ".join(text_chunks[0].text.split()[-10:])
    assert any(word in text_chunks[1].text for word in first_tail.split()[:3])


def test_a_table_is_never_merged_with_surrounding_text():
    blocks = [
        _text_block("Some intro text before the table."),
        _table_block("| A | B |\n|---|---|\n| 1 | 2 |"),
        _text_block("Some text after the table."),
    ]
    chunks = chunk_blocks(blocks)
    kinds = [c.kind for c in chunks]
    assert "table" in kinds
    table_chunk = next(c for c in chunks if c.kind == "table")
    assert "Some intro" not in table_chunk.text
    assert "Some text after" not in table_chunk.text


def test_an_oversized_table_is_split_with_a_repeated_header():
    header = "| Bolt | Torque |"
    sep = "|---|---|"
    rows = [f"| M{i} | {i * 10} Nm |" for i in range(400)]  # forces a split
    md = "\n".join([header, sep, *rows])
    chunks = chunk_blocks([_table_block(md)])
    table_chunks = [c for c in chunks if c.kind == "table"]
    assert len(table_chunks) > 1
    for c in table_chunks:
        assert c.text.splitlines()[0] == header
        assert c.text.splitlines()[1] == sep


def test_a_small_table_is_not_split():
    md = "| A | B |\n|---|---|\n| 1 | 2 |"
    chunks = chunk_blocks([_table_block(md)])
    assert len(chunks) == 1
    assert chunks[0].text == md


def test_figure_gets_its_own_caption_chunk():
    blocks = [
        Block(kind="figure_caption", page=1, bbox=Bbox(0, 0, 1, 1), section_path=[], text="a diagram"),
    ]
    chunks = chunk_blocks(blocks)
    assert len(chunks) == 1
    assert chunks[0].kind == "figure_caption"
    assert chunks[0].text == "a diagram"
