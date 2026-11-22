from django.urls import path

from . import api, frontend, views

urlpatterns = [
    path("", frontend.vue_app, name="dashboard"),
    path("api/csrf/", api.csrf_token, name="api_csrf"),
    path("api/session/", api.session, name="api_session"),
    path("api/session/logout/", api.session_logout, name="api_session_logout"),
    path("api/dashboard/", api.dashboard, name="api_dashboard"),
    path("api/clients/", api.clients, name="api_clients"),
    path("api/templates/", api.templates, name="api_templates"),
    path("api/documents/", api.documents, name="api_documents"),
    path("api/documents/<int:pk>/", api.document_detail, name="api_document_detail"),
    path("api/documents/<int:pk>/download/<str:file_type>/", views.document_download, name="api_document_download"),
    path("klienci/", views.client_list, name="client_list"),
    path("klienci/dodaj/", views.client_create, name="client_create"),
    path("szablony/", views.template_list, name="template_list"),
    path("szablony/dodaj/", views.template_create, name="template_create"),
    path("dokumenty/", views.document_list, name="document_list"),
    path("dokumenty/generuj/", views.document_generate, name="document_generate"),
    path("dokumenty/<int:pk>/", views.document_detail, name="document_detail"),
    path("dokumenty/<int:pk>/pobierz/<str:file_type>/", views.document_download, name="document_download"),
]
