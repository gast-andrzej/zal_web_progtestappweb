from django.conf import settings
from django.db import models


class CompanyProfile(models.Model):
    name = models.CharField("nazwa firmy", max_length=200)
    address = models.CharField("adres", max_length=300, blank=True)
    tax_id = models.CharField("NIP", max_length=20, blank=True)
    email = models.EmailField("e-mail", blank=True)
    phone = models.CharField("telefon", max_length=40, blank=True)

    class Meta:
        verbose_name = "dane firmy"
        verbose_name_plural = "dane firmy"

    def __str__(self):
        return self.name

    @classmethod
    def get_profile(cls):
        return cls.objects.first()


class Client(models.Model):
    name = models.CharField("nazwa / imię i nazwisko", max_length=200)
    address = models.CharField("adres", max_length=300, blank=True)
    tax_id = models.CharField("NIP", max_length=20, blank=True)
    email = models.EmailField("e-mail", blank=True)
    phone = models.CharField("telefon", max_length=40, blank=True)
    created_at = models.DateTimeField("dodano", auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "klient"
        verbose_name_plural = "klienci"

    def __str__(self):
        return self.name


class DocumentTemplate(models.Model):
    class DocumentType(models.TextChoices):
        AGREEMENT = "agreement", "Umowa"
        OFFER = "offer", "Oferta"
        INVOICE = "invoice", "Faktura"

    name = models.CharField("nazwa szablonu", max_length=150)
    document_type = models.CharField("rodzaj dokumentu", max_length=20, choices=DocumentType.choices)
    content = models.TextField("treść szablonu")
    is_active = models.BooleanField("aktywny", default=True)
    created_at = models.DateTimeField("utworzono", auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "szablon dokumentu"
        verbose_name_plural = "szablony dokumentów"

    def __str__(self):
        return self.name


class GeneratedDocument(models.Model):
    template = models.ForeignKey(
        DocumentTemplate, on_delete=models.PROTECT, related_name="documents", verbose_name="szablon"
    )
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="documents", verbose_name="klient")
    document_number = models.CharField("numer dokumentu", max_length=40, unique=True)
    title = models.CharField("tytuł", max_length=200)
    content_snapshot = models.TextField("wygenerowana treść")
    variables = models.JSONField("wartości pól", default=dict, blank=True)
    docx_file = models.FileField("plik DOCX", upload_to="documents/docx/")
    pdf_file = models.FileField("plik PDF", upload_to="documents/pdf/")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_documents",
        verbose_name="utworzył(a)",
    )
    created_at = models.DateTimeField("wygenerowano", auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "wygenerowany dokument"
        verbose_name_plural = "wygenerowane dokumenty"

    def __str__(self):
        return f"{self.document_number} — {self.title}"
