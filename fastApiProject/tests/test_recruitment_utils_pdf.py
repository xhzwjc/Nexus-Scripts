import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.services.recruitment_utils import extract_text_from_pdf


def test_extract_text_from_pdf_prefers_pypdf():
    page_one = Mock()
    page_one.extract_text.return_value = "第一页"
    page_two = Mock()
    page_two.extract_text.return_value = "第二页"

    with patch("app.services.recruitment_utils.PdfReader", return_value=SimpleNamespace(pages=[page_one, page_two])), patch(
        "app.services.recruitment_utils.pdfium"
    ) as pdfium_mock:
        text = extract_text_from_pdf(Path("/tmp/resume.pdf"))

    assert text == "第一页\n第二页"
    pdfium_mock.PdfDocument.assert_not_called()


def test_extract_text_from_pdf_requires_explicit_pdfium_fallback():
    with patch("app.services.recruitment_utils.PdfReader", None), patch(
        "app.services.recruitment_utils.pdfium", object()
    ), patch.dict(os.environ, {}, clear=False):
        try:
            extract_text_from_pdf(Path("/tmp/resume.pdf"))
            assert False, "expected RuntimeError"
        except RuntimeError as exc:
            assert "install pypdf" in str(exc)
            assert "RECRUITMENT_ENABLE_PDFIUM_FALLBACK=1" in str(exc)
