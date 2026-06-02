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


def test_extract_text_from_pdf_uses_pdfkit_fallback_on_macos():
    with patch("app.services.recruitment_utils.PdfReader", None), patch(
        "app.services.recruitment_utils.pdfium", None
    ), patch(
        "app.services.recruitment_utils.sys.platform", "darwin"
    ), patch(
        "app.services.recruitment_utils._extract_text_from_pdf_with_pdfkit", return_value="PDFKit 提取结果"
    ) as pdfkit_mock:
        text = extract_text_from_pdf(Path("/tmp/resume.pdf"))

    assert text == "PDFKit 提取结果"
    pdfkit_mock.assert_called_once_with(Path("/tmp/resume.pdf"))


def test_extract_text_from_pdf_falls_back_when_pypdf_returns_empty():
    page_one = Mock()
    page_one.extract_text.return_value = ""

    with patch("app.services.recruitment_utils.PdfReader", return_value=SimpleNamespace(pages=[page_one])), patch(
        "app.services.recruitment_utils.pdfium", Mock()
    ), patch(
        "app.services.recruitment_utils.sys.platform", "linux"
    ), patch(
        "app.services.recruitment_utils._extract_text_from_pdf_with_pdfium",
        side_effect=AssertionError("PDFium must not run in the main process"),
    ), patch(
        "app.services.recruitment_utils._extract_text_from_pdf_with_pdfium_subprocess",
        return_value="pdfium 提取结果",
    ) as pdfium_subprocess_mock:
        text = extract_text_from_pdf(Path("/tmp/resume.pdf"))

    assert text == "pdfium 提取结果"
    pdfium_subprocess_mock.assert_called_once_with(Path("/tmp/resume.pdf"))


def test_extract_text_from_pdf_uses_ocr_when_text_mapping_is_garbled():
    page_one = Mock()
    page_one.extract_text.return_value = "\x00\x01\x02\x03" * 20 + "SQL 2024"

    with patch("app.services.recruitment_utils.PdfReader", return_value=SimpleNamespace(pages=[page_one])), patch(
        "app.services.recruitment_utils.pdfium", None
    ), patch(
        "app.services.recruitment_utils.sys.platform", "darwin"
    ), patch(
        "app.services.recruitment_utils._extract_text_from_pdf_with_pdfkit", return_value="SQL Python 2024"
    ), patch(
        "app.services.recruitment_utils._extract_text_from_pdf_with_macos_vision_ocr",
        return_value="冯筱楠 高级商务经理 工作经历",
    ) as ocr_mock:
        text = extract_text_from_pdf(Path("/tmp/resume.pdf"))

    assert text == "冯筱楠 高级商务经理 工作经历"
    ocr_mock.assert_called_once_with(Path("/tmp/resume.pdf"))


def test_extract_text_from_pdf_uses_ocr_when_text_layer_is_only_watermark_tokens():
    page_one = Mock()
    page_one.extract_text.return_value = "\n".join(["10c67bc3cc69b9191HB-3tS1EFRUy4u6Wf2YWOKgnPDVMxBr"] * 20)

    with patch("app.services.recruitment_utils.PdfReader", return_value=SimpleNamespace(pages=[page_one])), patch(
        "app.services.recruitment_utils.pdfium", None
    ), patch(
        "app.services.recruitment_utils.sys.platform", "darwin"
    ), patch(
        "app.services.recruitment_utils._extract_text_from_pdf_with_pdfkit",
        return_value="\n".join(["10c67bc3cc69b9191HB-3tS1EFRUy4u6Wf2YWOKgnPDVMxBr"] * 20),
    ), patch(
        "app.services.recruitment_utils._extract_text_from_pdf_with_macos_vision_ocr",
        return_value="杨帅 产品经理 工作经历",
    ) as ocr_mock:
        text = extract_text_from_pdf(Path("/tmp/resume.pdf"))

    assert text == "杨帅 产品经理 工作经历"
    ocr_mock.assert_called_once_with(Path("/tmp/resume.pdf"))


def test_extract_text_from_pdf_uses_paddleocr_fallback_off_macos():
    page_one = Mock()
    page_one.extract_text.return_value = "\x00\x01\x02\x03" * 20 + "SQL 2024"

    with patch("app.services.recruitment_utils.PdfReader", return_value=SimpleNamespace(pages=[page_one])), patch(
        "app.services.recruitment_utils.pdfium", None
    ), patch(
        "app.services.recruitment_utils.sys.platform", "linux"
    ), patch(
        "app.services.recruitment_utils._extract_text_from_pdf_with_paddleocr_subprocess",
        return_value="PaddleOCR 简历正文",
    ) as ocr_mock:
        text = extract_text_from_pdf(Path("/tmp/resume.pdf"))

    assert text == "PaddleOCR 简历正文"
    ocr_mock.assert_called_once_with(Path("/tmp/resume.pdf"))


def test_extract_text_from_pdf_survives_pdfium_subprocess_crash_off_macos():
    page_one = Mock()
    page_one.extract_text.return_value = ""

    with patch("app.services.recruitment_utils.PdfReader", return_value=SimpleNamespace(pages=[page_one])), patch(
        "app.services.recruitment_utils.pdfium", Mock()
    ), patch(
        "app.services.recruitment_utils.sys.platform", "linux"
    ), patch(
        "app.services.recruitment_utils._extract_text_from_pdf_with_pdfium_subprocess",
        side_effect=RuntimeError("_extract_text_from_pdf_with_pdfium subprocess failed: exit=-6"),
    ), patch(
        "app.services.recruitment_utils._extract_text_from_pdf_with_paddleocr_subprocess",
        return_value="OCR 降级结果",
    ) as ocr_mock:
        text = extract_text_from_pdf(Path("/tmp/resume.pdf"))

    assert text == "OCR 降级结果"
    ocr_mock.assert_called_once_with(Path("/tmp/resume.pdf"))


def test_extract_text_from_pdf_requires_dependency_or_fallback():
    with patch("app.services.recruitment_utils.PdfReader", None), patch(
        "app.services.recruitment_utils.pdfium", None
    ), patch(
        "app.services.recruitment_utils.sys.platform", "linux"
    ), patch.dict(
        os.environ, {"RECRUITMENT_ENABLE_PDF_OCR": "0"}, clear=False
    ):
        try:
            extract_text_from_pdf(Path("/tmp/resume.pdf"))
            assert False, "expected RuntimeError"
        except RuntimeError as exc:
            assert "install pypdf" in str(exc)
            assert "isolated pypdfium2 fallback" in str(exc)
