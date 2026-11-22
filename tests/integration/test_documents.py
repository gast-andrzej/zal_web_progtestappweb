import json
from datetime import date
from io import BytesIO
from tempfile import TemporaryDirectory
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client as CsrfTestClient
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from docx import Document

from documents.forms import DocumentGenerationForm
from documents.models import Client, DocumentTemplate, GeneratedDocument
from documents.services import create_docx, create_document_files, create_document_number, create_pdf, render_document


class DocumentGenerationTests(TestCase):
    def setUp(self):
        self.media_dir = TemporaryDirectory()
        self.media_settings = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.media_settings.enable()
        self.user = get_user_model().objects.create_user(username="tester", password="safe-test-password")
        self.client.force_login(self.user)
        self.company_client = Client.objects.create(
            name="Klient Testowy", address="Warszawa", tax_id="1234567890", email="klient@example.com"
        )
        self.template = DocumentTemplate.objects.create(
            name="Oferta",
            document_type=DocumentTemplate.DocumentType.OFFER,
            content="Oferta {{ document_number }} dla {{ client_name }}\nKwota: {{ kwota }}",
        )

    def tearDown(self):
        self.media_settings.disable()
        self.media_dir.cleanup()

    def test_render_replaces_system_and_custom_fields(self):
        self.template.content = "Oferta {{   document_number }} dla {{client_name}}\nKwota: {{ kwota }}"
        content, variables = render_document(
            self.template,
            self.company_client,
            "Oferta testowa",
            "DOK/20260101/0001",
            {
                "kwota": "1 000 zł",
                "client_name": "Nadpisany klient",
                "document_number": "NADPISANY",
                "title": "Nadpisany tytuł",
            },
        )
        self.assertIn("Klient Testowy", content)
        self.assertIn("1 000 zł", content)
        self.assertIn("DOK/20260101/0001", content)
        self.assertNotIn("Nadpisany", content)
        self.assertEqual(variables["document_number"], "DOK/20260101/0001")
        self.assertEqual(variables["title"], "Oferta testowa")

    def test_render_uses_configured_local_date(self):
        with patch("documents.services.timezone.localdate", return_value=date(2026, 12, 31)):
            _, variables = render_document(
                self.template,
                self.company_client,
                "Oferta testowa",
                "DOK/20261231/0001",
                {},
            )
        self.assertEqual(variables["document_date"], "31.12.2026")

    def test_document_number_has_unique_capacity_without_exceeding_field_length(self):
        document_date = date(2026, 10, 17)
        numbers = {create_document_number(document_date) for _ in range(100)}
        self.assertEqual(len(numbers), 100)
        self.assertTrue(all(number.startswith("DOK/20261017/") for number in numbers))
        self.assertTrue(all(len(number) <= 40 for number in numbers))
        self.assertTrue(all(number.rsplit("/", 1)[-1].isalnum() for number in numbers))

    def test_generation_form_adds_custom_template_fields(self):
        form = DocumentGenerationForm(template=self.template)
        self.assertIn("kwota", form.fields)
        self.assertNotIn("client_name", form.fields)

    def test_main_pages_render(self):
        for name in ("dashboard", "client_list", "template_list", "document_list", "document_generate"):
            with self.subTest(page=name):
                response = self.client.get(reverse(name))
                self.assertEqual(response.status_code, 200)

    def test_generators_produce_docx_and_pdf(self):
        docx = create_docx("Oferta", "Pierwszy wiersz\nDrugi wiersz")
        pdf = create_pdf("Oferta", "Pierwszy wiersz\nDrugi wiersz: zażółć gęślą jaźń")
        self.assertTrue(docx.read().startswith(b"PK"))
        self.assertTrue(pdf.read().startswith(b"%PDF"))
        docx.seek(0)
        paragraphs = [paragraph.text for paragraph in Document(BytesIO(docx.read())).paragraphs]
        self.assertIn("Oferta", paragraphs)
        self.assertIn("Pierwszy wiersz", paragraphs)
        self.assertIn("Drugi wiersz", paragraphs)

    def test_polymorphic_renderer_creates_supported_file_types(self):
        files = create_document_files("Oferta", "Treść dokumentu")
        self.assertEqual(set(files), {"docx", "pdf"})
        self.assertTrue(files["docx"].read().startswith(b"PK"))
        self.assertTrue(files["pdf"].read().startswith(b"%PDF"))

    def test_generation_saves_files_and_history(self):
        response = self.client.post(
            reverse("document_generate"),
            {
                "template": self.template.pk,
                "client": self.company_client.pk,
                "title": "Oferta testowa",
                "kwota": "1 000 zł",
            },
        )
        self.assertEqual(response.status_code, 302)
        document = GeneratedDocument.objects.get()
        self.assertTrue(document.docx_file.name.endswith(".docx"))
        self.assertTrue(document.pdf_file.name.endswith(".pdf"))
        self.assertEqual(document.created_by, self.user)
        self.assertLessEqual(len(document.document_number), 40)
        local_created_date = timezone.localdate(document.created_at)
        self.assertTrue(document.document_number.startswith(f"DOK/{local_created_date:%Y%m%d}/"))
        self.assertEqual(document.variables["document_date"], local_created_date.strftime("%d.%m.%Y"))
        with document.docx_file.open("rb") as file:
            generated_docx = Document(BytesIO(file.read()))
        generated_paragraphs = "\n".join(paragraph.text for paragraph in generated_docx.paragraphs)
        self.assertIn("Klient Testowy", generated_paragraphs)
        self.assertIn("1 000 zł", generated_paragraphs)

    def test_download_requires_authentication_and_sends_attachment(self):
        response = self.client.post(
            reverse("document_generate"),
            {
                "template": self.template.pk,
                "client": self.company_client.pk,
                "title": "Oferta testowa",
                "kwota": "1 000 zł",
            },
        )
        document = GeneratedDocument.objects.get()
        self.client.logout()
        anonymous_response = self.client.get(reverse("document_download", args=[document.pk, "pdf"]))
        self.assertEqual(anonymous_response.status_code, 302)
        self.client.force_login(self.user)
        download = self.client.get(reverse("document_download", args=[document.pk, "pdf"]))
        self.assertEqual(download.status_code, 200)
        self.assertIn("attachment", download["Content-Disposition"])
        download.close()


class DocumentAPITests(TestCase):
    def setUp(self):
        self.media_dir = TemporaryDirectory()
        self.media_settings = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.media_settings.enable()
        self.user = get_user_model().objects.create_user(
            username="api-tester",
            password="safe-api-test-password",
        )

    def tearDown(self):
        self.media_settings.disable()
        self.media_dir.cleanup()

    def json_request(self, method, url, data=None):
        return getattr(self.client, method)(
            url,
            data=json.dumps(data or {}),
            content_type="application/json",
        )

    def test_anonymous_requests_receive_api_unauthorized_response(self):
        response = self.client.get(reverse("api_clients"))
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Zaloguj się, aby kontynuować.")

    def test_session_login_and_logout(self):
        token = self.client.get(reverse("api_csrf")).json()["csrfToken"]
        login_response = self.json_request(
            "post",
            reverse("api_session"),
            {"username": self.user.username, "password": "safe-api-test-password"},
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertTrue(login_response.json()["authenticated"])
        self.assertTrue(token)

        logout_response = self.client.post(reverse("api_session_logout"))
        self.assertEqual(logout_response.status_code, 200)
        self.assertFalse(self.client.get(reverse("api_session")).json()["authenticated"])

    def test_api_login_requires_a_valid_csrf_token(self):
        client = CsrfTestClient(enforce_csrf_checks=True)
        login_data = json.dumps(
            {"username": self.user.username, "password": "safe-api-test-password"}
        )
        rejected = client.post(
            reverse("api_session"),
            data=login_data,
            content_type="application/json",
        )
        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(rejected.json()["detail"], "Sesja formularza wygasła. Odśwież stronę i spróbuj ponownie.")

        csrf_token = client.get(reverse("api_csrf")).json()["csrfToken"]
        accepted = client.post(
            reverse("api_session"),
            data=login_data,
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertTrue(accepted.json()["authenticated"])

    def test_client_api_validates_and_persists_clients(self):
        self.client.force_login(self.user)
        invalid_response = self.json_request(
            "post",
            reverse("api_clients"),
            {"name": "Niepoprawny adres", "email": "nie-email"},
        )
        self.assertEqual(invalid_response.status_code, 400)
        self.assertIn("email", invalid_response.json()["errors"])

        response = self.json_request(
            "post",
            reverse("api_clients"),
            {"name": "Klient API", "address": "Warszawa", "email": "api@example.com"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["client"]["name"], "Klient API")
        self.assertEqual(self.client.get(reverse("api_clients")).json()["results"][0]["email"], "api@example.com")

    def test_document_api_rejects_malformed_template_ids(self):
        self.client.force_login(self.user)
        response = self.json_request(
            "post",
            reverse("api_documents"),
            {"template": "nie-numer", "client": 1, "title": "Umowa"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Nieprawidłowy identyfikator szablonu.")

    def test_template_and_document_generation_api(self):
        self.client.force_login(self.user)
        client = Client.objects.create(name="API Klient", email="klient@example.com")
        template_response = self.json_request(
            "post",
            reverse("api_templates"),
            {
                "name": "Umowa API",
                "document_type": "agreement",
                "content": "Umowa z {{ client_name }} na {{ okres }}",
                "is_active": True,
            },
        )
        self.assertEqual(template_response.status_code, 201)
        template = template_response.json()["template"]
        self.assertEqual(template["fields"], ["client_name", "okres"])

        response = self.json_request(
            "post",
            reverse("api_documents"),
            {
                "template": template["id"],
                "client": client.pk,
                "title": "Umowa testowa",
                "okres": "12 miesięcy",
            },
        )
        self.assertEqual(response.status_code, 201)
        document = response.json()["document"]
        self.assertIn("12 miesięcy", document["content"])
        self.assertTrue(document["downloads"]["docx"].endswith("/pobierz/docx/"))
        self.assertEqual(self.client.get(reverse("api_documents")).json()["results"][0]["id"], document["id"])
