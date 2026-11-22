from pathlib import Path

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound


def vue_app(request):
    index_file = Path(settings.BASE_DIR) / "static" / "vue" / "index.html"
    if not index_file.is_file():
        return HttpResponseNotFound(
            "Frontend Vue nie został zbudowany. Uruchom `npm install` oraz `npm run build` w katalogu frontend."
        )
    return HttpResponse(index_file.read_text(encoding="utf-8"))
