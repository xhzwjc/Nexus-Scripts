from __future__ import annotations

import mimetypes
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from pathlib import Path
from typing import Iterable, Sequence


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


def _guess_mime_type(file_name: str, explicit: str | None = None) -> tuple[str, str]:
    if explicit and "/" in explicit:
        return tuple(explicit.split("/", 1))  # type: ignore[return-value]
    guessed = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
    return tuple(guessed.split("/", 1))  # type: ignore[return-value]


def build_resume_email(
    *,
    sender: RecruitmentMailSenderRuntime,
    recipients: Sequence[str],
    subject: str,
    body_text: str,
    body_html: str | None = None,
    attachments: Iterable[MailAttachment] = (),
) -> EmailMessage:
    message = EmailMessage()
    sender_display = sender.from_name or sender.from_email
    message["From"] = f"{sender_display} <{sender.from_email}>"
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject
    message.set_content(body_text or "")
    if body_html:
        message.add_alternative(body_html, subtype="html")

    for attachment in attachments:
        major, minor = _guess_mime_type(attachment.file_name, attachment.mime_type)
        message.add_attachment(
            attachment.content,
            maintype=major,
            subtype=minor,
            filename=attachment.file_name,
        )
    return message


def send_email_via_smtp(sender: RecruitmentMailSenderRuntime, message: EmailMessage) -> None:
    if sender.use_ssl:
        with smtplib.SMTP_SSL(sender.smtp_host, sender.smtp_port, timeout=30) as client:
            client.login(sender.username, sender.password)
            client.send_message(message)
        return

    with smtplib.SMTP(sender.smtp_host, sender.smtp_port, timeout=30) as client:
        client.ehlo()
        if sender.use_starttls:
            client.starttls()
            client.ehlo()
        client.login(sender.username, sender.password)
        client.send_message(message)


def load_attachment_from_path(file_path: str | Path, file_name: str, mime_type: str | None = None) -> MailAttachment:
    path = Path(file_path)
    return MailAttachment(file_name=file_name, content=path.read_bytes(), mime_type=mime_type)
