import json
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from documents.models import Client, DocumentTemplate


class ExtendedDocumentAPITests(TestCase):
    def setUp(self):
        self.media_dir = TemporaryDirectory()
        self.media_settings = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.media_settings.enable()
        self.user = get_user_model().objects.create_user(
            username="extended-api-tester",
            password="safe-extended-api-password",
        )
        self.client.force_login(self.user)

    def tearDown(self):
        self.media_settings.disable()
        self.media_dir.cleanup()

    def json_request(self, method, url, data=None):
        return getattr(self.client, method)(
            url,
            data=json.dumps(data if data is not None else {}),
            content_type="application/json",
        )

    def test_session_reports_authenticated_user(self):
        response = self.client.get(reverse("api_session"))
        self.assertTrue(response.json()["authenticated"])
        self.assertEqual(response.json()["user"]["username"], self.user.username)

    def test_login_rejects_malformed_json(self):
        response = self.client.post(
            reverse("api_session"),
            data="{",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Nieprawidłowy format JSON.")

    def test_login_rejects_json_array(self):
        response = self.client.post(
            reverse("api_session"),
            data=json.dumps(["user", "password"]),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Żądanie musi zawierać obiekt JSON.")

    def test_login_requires_username(self):
        response = self.json_request("post", reverse("api_session"), {"password": "secret"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Podaj nazwę użytkownika i hasło.")

    def test_login_requires_password(self):
        response = self.json_request(
            "post",
            reverse("api_session"),
            {"username": self.user.username},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Podaj nazwę użytkownika i hasło.")

    def test_login_rejects_non_string_credentials(self):
        response = self.json_request(
            "post",
            reverse("api_session"),
            {"username": 123, "password": "secret"},
        )
        self.assertEqual(response.status_code, 400)

    def test_login_rejects_incorrect_password(self):
        response = self.json_request(
            "post",
            reverse("api_session"),
            {"username": self.user.username, "password": "wrong-password"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json().get("authenticated", False))

    def test_logout_requires_authentication(self):
        self.client.logout()
        response = self.client.post(reverse("api_session_logout"))
        self.assertEqual(response.status_code, 401)

    def test_clients_reject_malformed_json(self):
        response = self.client.post(
            reverse("api_clients"),
            data="{",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Nieprawidłowy format JSON.")

    def test_clients_reject_json_array(self):
        response = self.client.post(
            reverse("api_clients"),
            data=json.dumps([]),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Żądanie musi zawierać obiekt JSON.")

    def test_client_creation_requires_a_name(self):
        response = self.json_request("post", reverse("api_clients"), {"email": "valid@example.com"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.json()["errors"])

    def test_clients_are_returned_in_name_order(self):
        Client.objects.create(name="Żebra", email="zebra@example.com")
        Client.objects.create(name="Aster", email="aster@example.com")
        response = self.client.get(reverse("api_clients"))
        self.assertEqual(
            [client["name"] for client in response.json()["results"]],
            ["Aster", "Żebra"],
        )

    def test_template_creation_rejects_unknown_document_type(self):
        response = self.json_request(
            "post",
            reverse("api_templates"),
            {"name": "Nieznany", "document_type": "memo", "content": "Treść"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("document_type", response.json()["errors"])

    def test_template_creation_returns_sorted_unique_fields(self):
        response = self.json_request(
            "post",
            reverse("api_templates"),
            {
                "name": "Pola",
                "document_type": DocumentTemplate.DocumentType.AGREEMENT,
                "content": "{{ pole_b }} {{pole_a}} {{ pole_b }}",
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["template"]["fields"], ["pole_a", "pole_b"])

    def test_document_generation_rejects_inactive_template(self):
        inactive_template = DocumentTemplate.objects.create(
            name="Nieaktywny",
            document_type=DocumentTemplate.DocumentType.AGREEMENT,
            content="Treść",
            is_active=False,
        )
        client = Client.objects.create(name="Klient API")
        response = self.json_request(
            "post",
            reverse("api_documents"),
            {
                "template": inactive_template.pk,
                "client": client.pk,
                "title": "Dokument testowy",
            },
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Nie znaleziono aktywnego szablonu.")
