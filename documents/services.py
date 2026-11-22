from abc import ABC, abstractmethod
from datetime import date
from io import BytesIO
import os
from pathlib import Path
import re
from uuid import uuid4

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from docx import Document
from docx.shared import Pt
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from xml.sax.saxutils import escape

from .models import CompanyProfile, GeneratedDocument


def create_document_number(document_date: date) -> str:
    return f"DOK/{document_date:%Y%m%d}/{uuid4().hex[:27].upper()}"


def render_document(
    template,
    client,
    title,
    document_number,
    custom_values,
    document_date: date | None = None,
) -> tuple[str, dict]:
    company = CompanyProfile.get_profile()
    company = company or CompanyProfile(name="")
    context = {
        **custom_values,
        "company_name": company.name,
        "company_address": company.address,
        "company_tax_id": company.tax_id,
        "company_email": company.email,
        "company_phone": company.phone,
        "client_name": client.name,
        "client_address": client.address,
        "client_tax_id": client.tax_id,
        "client_email": client.email,
        "client_phone": client.phone,
        "document_number": document_number,
        "document_date": (document_date or timezone.localdate()).strftime("%d.%m.%Y"),
        "title": title,
    }
    content = re.sub(
        r"{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}",
        lambda match: str(context.get(match.group(1), match.group(0))),
        template.content,
    )
    return content, context


def generate_document(template, client, title, custom_values, created_by):
    document_date = timezone.localdate()
    document_number = create_document_number(document_date)
    content, variables = render_document(
        template,
        client,
        title,
        document_number,
        custom_values,
        document_date=document_date,
    )
    generated_files = create_document_files(title, content)

    with transaction.atomic():
        document = GeneratedDocument.objects.create(
            template=template,
            client=client,
            document_number=document_number,
            title=title,
            content_snapshot=content,
            variables=variables,
            created_by=created_by,
        )
        document.docx_file.save(
            f"{document_number.replace('/', '-')}.docx",
            ContentFile(generated_files["docx"].getvalue()),
            save=False,
        )
        document.pdf_file.save(
            f"{document_number.replace('/', '-')}.pdf",
            ContentFile(generated_files["pdf"].getvalue()),
            save=False,
        )
        document.save()
    return document


def create_docx(title, content):
    output = BytesIO()
    document = Document()
    document.add_heading(title, level=1)
    for paragraph_text in content.splitlines():
        paragraph = document.add_paragraph(paragraph_text)
        for run in paragraph.runs:
            run.font.size = Pt(11)
    document.save(output)
    output.seek(0)
    return output


def create_pdf(title, content):
    font_path = os.environ.get("DOCUMENT_PDF_FONT")
    candidates = [
        Path(font_path) if font_path else None,
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    font_file = next((path for path in candidates if path and path.is_file()), None)
    if font_file is None:
        raise FileNotFoundError(
            "Nie znaleziono czcionki Unicode dla PDF. Ustaw DOCUMENT_PDF_FONT na ścieżkę do pliku TTF."
        )
    if "DocumentSans" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DocumentSans", str(font_file)))

    output = BytesIO()
    pdf = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=22 * mm,
        leftMargin=22 * mm,
        topMargin=22 * mm,
        bottomMargin=22 * mm,
        title=title,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("DocumentTitle", parent=styles["Title"], fontName="DocumentSans")
    body_style = ParagraphStyle(
        "DocumentBody",
        parent=styles["BodyText"],
        fontName="DocumentSans",
        alignment=TA_LEFT,
        leading=16,
        textColor=colors.HexColor("#263238"),
        spaceAfter=7,
    )
    story = [Paragraph(escape(title), title_style), Spacer(1, 10 * mm)]
    story.extend(Paragraph(escape(line) or "&nbsp;", body_style) for line in content.splitlines())
    pdf.build(story)
    output.seek(0)
    return output


class DocumentRenderer(ABC):
    file_type = ""

    @abstractmethod
    def render(self, title, content):
        raise NotImplementedError


class DocxRenderer(DocumentRenderer):
    file_type = "docx"

    def render(self, title, content):
        return create_docx(title, content)


class PdfRenderer(DocumentRenderer):
    file_type = "pdf"

    def render(self, title, content):
        return create_pdf(title, content)


def create_document_files(title, content):
    renderers = (DocxRenderer(), PdfRenderer())
    return {renderer.file_type: renderer.render(title, content) for renderer in renderers}
