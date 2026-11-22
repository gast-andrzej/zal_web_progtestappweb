from django.contrib import admin

from .models import Client, CompanyProfile, DocumentTemplate, GeneratedDocument


@admin.register(CompanyProfile)
class CompanyProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "tax_id", "email")

    def has_add_permission(self, request):
        return not CompanyProfile.objects.exists()


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ("name", "tax_id", "email", "phone")
    search_fields = ("name", "tax_id", "email")


@admin.register(DocumentTemplate)
class DocumentTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "document_type", "is_active", "created_at")
    list_filter = ("document_type", "is_active")
    search_fields = ("name",)


@admin.register(GeneratedDocument)
class GeneratedDocumentAdmin(admin.ModelAdmin):
    list_display = ("document_number", "title", "client", "template", "created_at", "created_by")
    list_filter = ("template__document_type", "created_at")
    search_fields = ("document_number", "title", "client__name")
    readonly_fields = ("content_snapshot", "variables", "docx_file", "pdf_file", "created_at")
