import json
import re
from functools import wraps

from django.contrib.auth import authenticate, login, logout
from django.core.exceptions import ValidationError
from django.http import HttpResponseForbidden, JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

from .forms import ClientForm, DocumentGenerationForm, TemplateForm
from .models import Client, DocumentTemplate, GeneratedDocument
from .services import generate_document


def api_login_required(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"detail": "Zaloguj się, aby kontynuować."}, status=401)
        return view(request, *args, **kwargs)

    return wrapped


def read_json(request):
    try:
        data = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, JsonResponse({"detail": "Nieprawidłowy format JSON."}, status=400)
    if not isinstance(data, dict):
        return None, JsonResponse({"detail": "Żądanie musi zawierać obiekt JSON."}, status=400)
    return data, None


def form_errors(form):
    return JsonResponse({"errors": form.errors.get_json_data()}, status=400)


def csrf_failure(request, reason=""):
    if request.path.startswith("/api/"):
        return JsonResponse({"detail": "Sesja formularza wygasła. Odśwież stronę i spróbuj ponownie."}, status=403)
    return HttpResponseForbidden("Żądanie zostało odrzucone z powodu nieprawidłowej weryfikacji CSRF.")


def serialize_client(client):
    return {
        "id": client.pk,
        "name": client.name,
        "address": client.address,
        "tax_id": client.tax_id,
        "email": client.email,
        "phone": client.phone,
        "created_at": client.created_at.isoformat(),
    }


def serialize_template(template):
    return {
        "id": template.pk,
        "name": template.name,
        "document_type": template.document_type,
        "document_type_label": template.get_document_type_display(),
        "content": template.content,
        "is_active": template.is_active,
        "fields": sorted(
            set(re.findall(r"{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}", template.content))
        ),
        "created_at": template.created_at.isoformat(),
    }


def serialize_document(document):
    return {
        "id": document.pk,
        "document_number": document.document_number,
        "title": document.title,
        "content": document.content_snapshot,
        "client": {"id": document.client_id, "name": document.client.name},
        "template": {
            "id": document.template_id,
            "name": document.template.name,
            "document_type": document.template.document_type,
            "document_type_label": document.template.get_document_type_display(),
        },
        "created_at": document.created_at.isoformat(),
        "downloads": {
            "docx": f"/dokumenty/{document.pk}/pobierz/docx/",
            "pdf": f"/dokumenty/{document.pk}/pobierz/pdf/",
        },
    }


@ensure_csrf_cookie
@require_GET
def csrf_token(request):
    return JsonResponse({"csrfToken": get_token(request)})


@require_http_methods(["GET", "POST"])
def session(request):
    if request.method == "GET":
        if not request.user.is_authenticated:
            return JsonResponse({"authenticated": False})
        return JsonResponse(
            {
                "authenticated": True,
                "user": {
                    "id": request.user.pk,
                    "username": request.user.get_username(),
                    "name": request.user.get_full_name() or request.user.get_username(),
                    "is_staff": request.user.is_staff,
                },
            }
        )

    data, error = read_json(request)
    if error:
        return error
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return JsonResponse({"detail": "Podaj nazwę użytkownika i hasło."}, status=400)
    user = authenticate(request, username=username, password=password)
    if user is None:
        return JsonResponse({"detail": "Nieprawidłowa nazwa użytkownika lub hasło."}, status=400)
    login(request, user)
    return JsonResponse(
        {
            "authenticated": True,
            "user": {
                "id": user.pk,
                "username": user.get_username(),
                "name": user.get_full_name() or user.get_username(),
                "is_staff": user.is_staff,
            },
        }
    )


@api_login_required
@require_http_methods(["POST"])
def session_logout(request):
    logout(request)
    return JsonResponse({"authenticated": False})


@api_login_required
@require_GET
def dashboard(request):
    recent_documents = GeneratedDocument.objects.select_related("client", "template")[:6]
    return JsonResponse(
        {
            "document_count": GeneratedDocument.objects.count(),
            "client_count": Client.objects.count(),
            "template_count": DocumentTemplate.objects.filter(is_active=True).count(),
            "recent_documents": [serialize_document(document) for document in recent_documents],
        }
    )


@api_login_required
@require_http_methods(["GET", "POST"])
def clients(request):
    if request.method == "GET":
        return JsonResponse({"results": [serialize_client(client) for client in Client.objects.all()]})
    data, error = read_json(request)
    if error:
        return error
    form = ClientForm(data)
    if not form.is_valid():
        return form_errors(form)
    return JsonResponse({"client": serialize_client(form.save())}, status=201)


@api_login_required
@require_http_methods(["GET", "POST"])
def templates(request):
    if request.method == "GET":
        return JsonResponse(
            {"results": [serialize_template(template) for template in DocumentTemplate.objects.all()]}
        )
    data, error = read_json(request)
    if error:
        return error
    form = TemplateForm(data)
    if not form.is_valid():
        return form_errors(form)
    return JsonResponse({"template": serialize_template(form.save())}, status=201)


@api_login_required
@require_http_methods(["GET", "POST"])
def documents(request):
    if request.method == "GET":
        queryset = GeneratedDocument.objects.select_related("client", "template")
        return JsonResponse({"results": [serialize_document(document) for document in queryset]})

    data, error = read_json(request)
    if error:
        return error
    template_id = data.get("template")
    selected_template = None
    if template_id not in (None, ""):
        try:
            template_pk = DocumentTemplate._meta.pk.to_python(template_id)
        except (TypeError, ValueError, ValidationError):
            return JsonResponse({"detail": "Nieprawidłowy identyfikator szablonu."}, status=400)
        selected_template = DocumentTemplate.objects.filter(pk=template_pk, is_active=True).first()
        if selected_template is None:
            return JsonResponse({"detail": "Nie znaleziono aktywnego szablonu."}, status=404)
    form = DocumentGenerationForm(data, template=selected_template)
    if not form.is_valid():
        return form_errors(form)

    template = selected_template or form.cleaned_data["template"]
    client = form.cleaned_data["client"]
    custom_values = {
        key: form.cleaned_data[key]
        for key in form.fields
        if key not in {"template", "client", "title"}
    }
    document = generate_document(
        template,
        client,
        form.cleaned_data["title"],
        custom_values,
        request.user,
    )
    return JsonResponse({"document": serialize_document(document)}, status=201)


@api_login_required
@require_GET
def document_detail(request, pk):
    document = (
        GeneratedDocument.objects.select_related("client", "template")
        .filter(pk=pk)
        .first()
    )
    if document is None:
        return JsonResponse({"detail": "Nie znaleziono dokumentu."}, status=404)
    return JsonResponse({"document": serialize_document(document)})
