from __future__ import annotations

import io
import mimetypes
import smtplib
import zipfile
from dataclasses import dataclass
from email import encoders
from email.header import Header
from email.message import Message
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Iterable, Sequence
from urllib.parse import quote


@dataclass(frozen=True)
class MailAttachment:
    file_name: str
    content: bytes
    mime_type: str | None = None


@dataclass(frozen=True)
class RecruitmentMailSenderRuntime:
    from_email: str
    from_name: str | None
    smtp_host: str
    smtp_port: int
    username: str
    password: str
    use_ssl: bool
    use_starttls: bool


GENERIC_BINARY_MIME_TYPES = {
    "application/octet-stream",
    "binary/octet-stream",
    "application/x-msdownload",
    "application/x-download",
    "application/download",
    "application/force-download",
}


def _sniff_attachment_signature(content: bytes) -> tuple[str | None, str | None]:
    if content.startswith(b"%PDF-"):
        return "application/pdf", ".pdf"
    if content.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                file_names = set(archive.namelist())
        except Exception:
            return None, None
        if "word/document.xml" in file_names:
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"
        if "ppt/presentation.xml" in file_names:
            return "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"
        if "xl/workbook.xml" in file_names:
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"
    return None, None


def _normalize_attachment_name(file_name: str, content: bytes, explicit: str | None = None) -> str:
    normalized_name = Path((file_name or "").strip() or "resume").name or "resume"
    stem = Path(normalized_name).stem or "resume"
    current_ext = Path(normalized_name).suffix.lower()
    sniffed_mime, sniffed_ext = _sniff_attachment_signature(content)
    explicit_ext = Path(normalized_name).suffix if current_ext else ""
    guessed_from_name = mimetypes.guess_type(normalized_name)[0]
    if current_ext in {"", ".bin", ".dat", ".tmp"}:
        preferred_ext = sniffed_ext
        if not preferred_ext and guessed_from_name:
            preferred_ext = mimetypes.guess_extension(guessed_from_name, strict=False)
        if not preferred_ext and explicit and explicit.strip().lower() not in GENERIC_BINARY_MIME_TYPES:
            preferred_ext = mimetypes.guess_extension(explicit.strip().lower(), strict=False)
        if preferred_ext:
            return f"{stem}{preferred_ext}"
    if sniffed_mime and current_ext == ".bin" and sniffed_ext:
        return f"{stem}{sniffed_ext}"
    if explicit_ext:
        return normalized_name
    return normalized_name


def _escape_mime_param_value(file_name: str) -> str:
    cleaned = (file_name or "resume").replace("\\", "_").replace('"', "'").replace("\r", " ").replace("\n", " ").strip()
    return cleaned or "resume"


def _set_attachment_headers(part: Message, *, content_type: str, file_name: str) -> None:
    original_name = _escape_mime_param_value(file_name)
    encoded_name = Header(original_name, "utf-8").encode()
    quoted_name = quote(original_name)
    content_type_value = f'{content_type}; name="{encoded_name}"'
    content_disposition_value = f'attachment; filename="{encoded_name}"'
    if any(ord(ch) > 127 for ch in original_name):
        content_type_value = f"{content_type_value}; name*=UTF-8''{quoted_name}"
        content_disposition_value = f"{content_disposition_value}; filename*=UTF-8''{quoted_name}"
    if part.get("Content-Type"):
        part.replace_header("Content-Type", content_type_value)
    else:
        part.add_header("Content-Type", content_type_value)
    if part.get("Content-Disposition"):
        part.replace_header("Content-Disposition", content_disposition_value)
    else:
        part.add_header("Content-Disposition", content_disposition_value)


def _guess_mime_type(file_name: str, content: bytes, explicit: str | None = None) -> tuple[str, str]:
    sniffed_mime, _sniffed_ext = _sniff_attachment_signature(content)
    if sniffed_mime:
        return tuple(sniffed_mime.split("/", 1))  # type: ignore[return-value]
    guessed = mimetypes.guess_type(file_name)[0]
    normalized_explicit = (explicit or "").strip().lower()
    if guessed and normalized_explicit in GENERIC_BINARY_MIME_TYPES:
        return tuple(guessed.split("/", 1))  # type: ignore[return-value]
    if normalized_explicit and normalized_explicit not in GENERIC_BINARY_MIME_TYPES and "/" in normalized_explicit:
        return tuple(explicit.split("/", 1))  # type: ignore[return-value]
    guessed = guessed or "application/octet-stream"
    return tuple(guessed.split("/", 1))  # type: ignore[return-value]


def build_resume_email(
    *,
    sender: RecruitmentMailSenderRuntime,
    recipients: Sequence[str],
    cc_recipients: Sequence[str] = (),
    bcc_recipients: Sequence[str] = (),
    subject: str,
    body_text: str,
    body_html: str | None = None,
    attachments: Iterable[MailAttachment] = (),
) -> Message:
    message = MIMEMultipart("mixed")
    sender_display = sender.from_name or sender.from_email
    message["From"] = f"{sender_display} <{sender.from_email}>"
    message["To"] = ", ".join(recipients)
    if cc_recipients:
        message["Cc"] = ", ".join(cc_recipients)
    if bcc_recipients:
        message["Bcc"] = ", ".join(bcc_recipients)
    message["Subject"] = subject
    if body_html:
        alternative = MIMEMultipart("alternative")
        alternative.attach(MIMEText(body_text or "", "plain", "utf-8"))
        alternative.attach(MIMEText(body_html, "html", "utf-8"))
        message.attach(alternative)
    else:
        message.attach(MIMEText(body_text or "", "plain", "utf-8"))

    for attachment in attachments:
        normalized_name = _normalize_attachment_name(attachment.file_name, attachment.content, attachment.mime_type)
        major, minor = _guess_mime_type(normalized_name, attachment.content, attachment.mime_type)
        part = MIMEBase(major, minor)
        part.set_payload(attachment.content)
        encoders.encode_base64(part)
        _set_attachment_headers(part, content_type=f"{major}/{minor}", file_name=normalized_name)
        message.attach(part)
    return message


def send_email_via_smtp(sender: RecruitmentMailSenderRuntime, message: Message, recipients: Sequence[str]) -> None:
    if sender.use_ssl:
        with smtplib.SMTP_SSL(sender.smtp_host, sender.smtp_port, timeout=30) as client:
            client.login(sender.username, sender.password)
            client.send_message(message, from_addr=sender.from_email, to_addrs=list(recipients))
        return

    with smtplib.SMTP(sender.smtp_host, sender.smtp_port, timeout=30) as client:
        client.ehlo()
        if sender.use_starttls:
            client.starttls()
            client.ehlo()
        client.login(sender.username, sender.password)
        client.send_message(message, from_addr=sender.from_email, to_addrs=list(recipients))


def load_attachment_from_path(file_path: str | Path, file_name: str, mime_type: str | None = None) -> MailAttachment:
    path = Path(file_path)
    return MailAttachment(file_name=file_name, content=path.read_bytes(), mime_type=mime_type)
