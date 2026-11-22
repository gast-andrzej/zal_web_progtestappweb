from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect, render

from .forms import ClientForm, DocumentGenerationForm, TemplateForm
from .models import Client, DocumentTemplate, GeneratedDocument
from .services import generate_document


@login_required
def dashboard(request):
    context = {
        "document_count": GeneratedDocument.objects.count(),
        "client_count": Client.objects.count(),
        "template_count": DocumentTemplate.objects.filter(is_active=True).count(),
        "recent_documents": GeneratedDocument.objects.select_related("client", "template")[:6],
    }
    return render(request, "documents/dashboard.html", context)


@login_required
def client_list(request):
    return render(request, "documents/client_list.html", {"clients": Client.objects.all()})


@login_required
def client_create(request):
    form = ClientForm(request.POST or None)
    if form.is_valid():
        form.save()
        messages.success(request, "Klient został zapisany.")
        return redirect("client_list")
    return render(request, "documents/client_form.html", {"form": form})


@login_required
def template_list(request):
    return render(request, "documents/template_list.html", {"templates": DocumentTemplate.objects.all()})


@login_required
def template_create(request):
    form = TemplateForm(request.POST or None)
    if form.is_valid():
        form.save()
        messages.success(request, "Szablon został zapisany.")
        return redirect("template_list")
    return render(request, "documents/template_form.html", {"form": form})


@login_required
def document_generate(request):
    selected_template = None
    template_id = request.GET.get("template") or request.POST.get("template")
    if template_id:
        selected_template = get_object_or_404(DocumentTemplate, pk=template_id, is_active=True)

    form = DocumentGenerationForm(request.POST or None, template=selected_template)
    if form.is_valid():
        template = selected_template or form.cleaned_data["template"]
        client = form.cleaned_data["client"]
        custom_values = {key: form.cleaned_data[key] for key in form.fields if key not in {"template", "client", "title"}}
        document = generate_document(
            template,
            client,
            form.cleaned_data["title"],
            custom_values,
            request.user,
        )
        messages.success(request, f"Dokument {document.document_number} został wygenerowany.")
        return redirect("document_detail", pk=document.pk)
    return render(
        request,
        "documents/document_form.html",
        {"form": form, "selected_template": selected_template},
    )


@login_required
def document_list(request):
    documents = GeneratedDocument.objects.select_related("client", "template")
    return render(request, "documents/document_list.html", {"documents": documents})


@login_required
def document_detail(request, pk):
    document = get_object_or_404(GeneratedDocument.objects.select_related("client", "template"), pk=pk)
    return render(request, "documents/document_detail.html", {"document": document})


@login_required
def document_download(request, pk, file_type):
    document = get_object_or_404(GeneratedDocument, pk=pk)
    if file_type not in {"docx", "pdf"}:
        raise Http404("Nieznany format dokumentu.")
    file_field = getattr(document, f"{file_type}_file")
    if not file_field:
        raise Http404("Plik dokumentu nie istnieje.")
    return FileResponse(
        file_field.open("rb"),
        as_attachment=True,
        filename=file_field.name.rsplit("/", 1)[-1],
    )
