# System dokumentów firmowych

Aplikacja Django do prowadzenia kartoteki klientów, zarządzania szablonami oraz generowania i archiwizowania umów, ofert i faktur jako DOCX i PDF.

## Uruchomienie lokalne

Wymagany Python 3.10 lub nowszy oraz Node.js LTS z npm.

Po uruchomieniu aplikacja sprawdza i instaluje brakujące zależności backendu oraz Vue, buduje frontend, wykonuje migracje i uruchamia Django:

```powershell
python run.py
```

Otwórz `http://127.0.0.1:8000/`. Podczas pierwszego uruchomienia instalacja pakietów wymaga dostępu do internetu. Argumenty serwera można przekazać dalej, np. `python run.py 0.0.0.0:8000`.

Alternatywnie można uruchomić poszczególne kroki ręcznie:

```powershell
$env:DJANGO_DEBUG = "1"
$env:DJANGO_SECRET_KEY = [guid]::NewGuid().ToString("N")
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Set-Location frontend
npm install
npm run build
Set-Location ..
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Zaloguj się kontem utworzonym poleceniem `createsuperuser`. Dane firmy dodaje się w panelu `/admin/` jako rekord „Dane firmy”. Backend udostępnia JSON API pod `/api/`, a Vue korzysta z sesji Django i ochrony CSRF. Dla pracy nad frontendem można uruchomić backend przez `python manage.py runserver`, a w drugim terminalu `Set-Location frontend; npm run dev`.

### API

| Endpoint | Metody | Przeznaczenie |
| --- | --- | --- |
| `/api/csrf/` | GET | Token CSRF dla formularzy Vue |
| `/api/session/` | GET, POST | Stan sesji oraz logowanie |
| `/api/session/logout/` | POST | Wylogowanie |
| `/api/dashboard/` | GET | Liczniki i ostatnie dokumenty |
| `/api/clients/` | GET, POST | Lista i tworzenie klientów |
| `/api/templates/` | GET, POST | Lista i tworzenie szablonów |
| `/api/documents/` | GET, POST | Archiwum i generowanie DOCX/PDF |
| `/api/documents/<id>/` | GET | Szczegóły dokumentu |

## Przykładowe dane

Aby dodać przykładowych klientów oraz szablony umów i faktury, uruchom:

```powershell
python manage.py load_sample_data
```

Polecenie można uruchamiać ponownie bez tworzenia duplikatów. Dane klientów są fikcyjne, przeznaczone wyłącznie do demonstracji. Szablony dokumentów są przykładami do dostosowania, a nie poradą prawną ani gotowymi dokumentami do podpisu.

## Pierwszy dokument

1. Dodaj dane firmy w panelu administracyjnym.
2. Dodaj klienta w sekcji **Klienci**.
3. Utwórz szablon w sekcji **Szablony**.
4. Użyj pól szablonu zapisanych jako `{{ nazwa_pola }}`, na przykład `{{ client_name }}`. Pola firmy i klienta oraz numer, data i tytuł są uzupełniane automatycznie. Własne pola pojawią się w formularzu generowania.
5. Wygeneruj dokument; historia i pliki do pobrania znajdują się w archiwum.

## Konfiguracja wdrożeniowa

Domyślnie `DJANGO_DEBUG=0`; bez ustawionego `DJANGO_SECRET_KEY` aplikacja odmawia startu. Do lokalnego uruchomienia `run.py` włącza tryb debugowania i tworzy losowy klucz tylko dla tego procesu. Przed wdrożeniem ustaw własny `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=0` i listę hostów w `DJANGO_ALLOWED_HOSTS`. W trybie produkcyjnym aplikacja wymusza HTTPS, ciasteczka sesyjne i CSRF z flagą `Secure` oraz roczny HSTS. Skonfiguruj TLS i zaufany reverse proxy przed uruchomieniem; nie włączaj `SECURE_PROXY_SSL_HEADER`, jeśli proxy nie usuwa i nie ustawia samodzielnie nagłówka protokołu. Skonfiguruj też trwałą bazę danych, katalog plików `media/` oraz kopie zapasowe. PDF wymaga czcionki Unicode z polskimi znakami; domyślnie używana jest Arial w Windows lub DejaVu Sans w typowych dystrybucjach Linuxa. W innych środowiskach ustaw `DOCUMENT_PDF_FONT` na ścieżkę do pliku `.ttf`.

## Testy

Testy są pogrupowane w katalogach: `tests/unit/` (Vue), `tests/integration/` (Django), `tests/e2e/` (Playwright), `tests/mutation/` (Stryker) oraz `tests/pentest/` (bezpieczne testy penetracyjne na lokalnej bazie testowej). Pierwsze cztery grupy mają po 30 przypadków, a testy penetracyjne — 50. Runner w Pythonie pozwala uruchomić każdą grupę oddzielnie albo cały zestaw; przed E2E buduje frontend, uruchamia wszystkie wybrane grupy nawet po błędzie i na końcu podaje podsumowanie. Zwraca niezerowy kod, jeśli testy nie przejdą:

```powershell
python tests/run_tests.py
python tests/run_tests.py unit
python tests/run_tests.py integration
python tests/run_tests.py e2e
python tests/run_tests.py mutation
python tests/run_tests.py pentest
```

Testy integracyjne sprawdzają API, bazę, logowanie i generowanie dokumentów. Vitest sprawdza interfejs Vue, a oddzielna suita mutacyjna sprawdza klienta API podczas analizy zmian Strykera. Testy penetracyjne pokrywają CSRF, uwierzytelnianie i autoryzację, walidację wejścia, XSS, pobieranie plików oraz konfigurację produkcyjną. Playwright wykonuje testy E2E formularza logowania.

## Krótka checklista testów ręcznych

1. Zaloguj się, dodaj klienta i sprawdź, czy pojawił się na liście.
2. Dodaj szablon umowy z polami `{{ client_name }}` i `{{ okres }}`.
3. Wygeneruj dokument dla klienta i uzupełnij dodatkowe pole `okres`.
4. Pobierz DOCX oraz PDF i potwierdź, że polskie znaki i wstawione wartości są widoczne.
5. Wyloguj się i sprawdź, czy archiwum oraz endpointy API nie są dostępne bez zalogowania.
