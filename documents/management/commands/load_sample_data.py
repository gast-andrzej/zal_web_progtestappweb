from django.core.management.base import BaseCommand
from django.db import transaction

from documents.models import Client, DocumentTemplate


CLIENTS = [
    {
        "name": "Przykładowa firma Alfa sp. z o.o.",
        "address": "ul. Przykładowa 1, 00-001 Warszawa",
        "email": "alfa@example.com",
        "phone": "+48 000 000 001",
    },
    {
        "name": "Przykładowa firma Beta s.c.",
        "address": "ul. Testowa 2, 00-002 Warszawa",
        "email": "beta@example.com",
        "phone": "+48 000 000 002",
    },
    {
        "name": "Studio Gamma",
        "address": "ul. Fikcyjna 3, 00-003 Kraków",
        "email": "gamma@example.com",
        "phone": "+48 000 000 003",
    },
    {
        "name": "Pracownia Delta",
        "address": "ul. Demo 4, 00-004 Gdańsk",
        "email": "delta@example.com",
        "phone": "+48 000 000 004",
    },
    {
        "name": "Usługi Epsilon",
        "address": "ul. Wzorcowa 5, 00-005 Wrocław",
        "email": "epsilon@example.com",
        "phone": "+48 000 000 005",
    },
]

AGREEMENT_TEMPLATES = [
    (
        "Umowa o świadczenie usług",
        """UMOWA O ŚWIADCZENIE USŁUG

Zawarta dnia {{ document_date }} pomiędzy {{ company_name }}, z siedzibą {{ company_address }}, NIP {{ company_tax_id }}, dalej „Usługodawcą”, a {{ client_name }}, z siedzibą {{ client_address }}, NIP {{ client_tax_id }}, dalej „Klientem”.

§ 1. Przedmiot umowy
Usługodawca wykona na rzecz Klienta: {{ zakres_uslug }}.

§ 2. Wynagrodzenie
Wynagrodzenie wynosi {{ wynagrodzenie }}. Termin płatności: {{ termin_platnosci }}.

§ 3. Termin i postanowienia końcowe
Umowa obowiązuje od {{ data_rozpoczecia }} do {{ data_zakonczenia }}. Zmiany wymagają formy pisemnej.

Usługodawca: ____________________    Klient: ____________________""",
    ),
    (
        "Umowa o zachowaniu poufności (NDA)",
        """UMOWA O ZACHOWANIU POUFNOŚCI

Zawarta dnia {{ document_date }} pomiędzy {{ company_name }} a {{ client_name }}.

§ 1. Informacje poufne
Strony zobowiązują się chronić informacje poufne dotyczące: {{ zakres_informacji }} i wykorzystywać je wyłącznie w celu {{ cel_wspolpracy }}.

§ 2. Obowiązki
Informacji poufnych nie wolno ujawniać osobom trzecim, z wyjątkiem przypadków wymaganych prawem. Obowiązek poufności trwa {{ okres_poufnosci }}.

§ 3. Postanowienia końcowe
Umowa obowiązuje od dnia podpisania. Zmiany wymagają formy pisemnej.

{{ company_name }}: ____________________    {{ client_name }}: ____________________""",
    ),
    (
        "Umowa współpracy",
        """UMOWA O WSPÓŁPRACY

Zawarta dnia {{ document_date }} pomiędzy {{ company_name }} a {{ client_name }}.

§ 1. Zakres współpracy
Strony podejmują współpracę w zakresie {{ zakres_wspolpracy }}. Szczegółowe zadania: {{ zadania }}.

§ 2. Rozliczenia
Zasady wynagrodzenia i rozliczeń: {{ warunki_rozliczen }}. Osobą kontaktową jest {{ osoba_kontaktowa }}.

§ 3. Czas trwania
Umowa obowiązuje od {{ data_rozpoczecia }} przez {{ okres_umowy }}. Każda ze stron może ją wypowiedzieć z zachowaniem {{ okres_wypowiedzenia }}.

Podpisy stron: ____________________    ____________________""",
    ),
    (
        "Umowa sprzedaży",
        """UMOWA SPRZEDAŻY

Zawarta dnia {{ document_date }} pomiędzy {{ company_name }}, dalej „Sprzedawcą”, a {{ client_name }}, dalej „Kupującym”.

§ 1. Przedmiot sprzedaży
Sprzedawca sprzedaje, a Kupujący nabywa: {{ przedmiot_sprzedazy }}. Ilość i specyfikacja: {{ specyfikacja }}.

§ 2. Cena i wydanie
Cena wynosi {{ cena }}. Termin i miejsce wydania: {{ termin_miejsce_wydania }}.

§ 3. Postanowienia końcowe
Szczegółowe warunki odbioru i reklamacji: {{ warunki_dodatkowe }}. Umowę sporządzono w dwóch egzemplarzach.

Sprzedawca: ____________________    Kupujący: ____________________""",
    ),
    (
        "Umowa serwisowa",
        """UMOWA SERWISOWA

Zawarta dnia {{ document_date }} pomiędzy {{ company_name }} a {{ client_name }}.

§ 1. Zakres serwisu
Usługodawca zapewnia serwis {{ przedmiot_serwisu }} w zakresie {{ zakres_serwisu }}.

§ 2. Zgłoszenia i wynagrodzenie
Zgłoszenia są przyjmowane przez {{ kanal_zgloszen }}. Czas reakcji: {{ czas_reakcji }}. Wynagrodzenie: {{ wynagrodzenie }}.

§ 3. Okres obowiązywania
Umowa obowiązuje od {{ data_rozpoczecia }} do {{ data_zakonczenia }}. Pozostałe uzgodnienia: {{ postanowienia_dodatkowe }}.

Usługodawca: ____________________    Klient: ____________________""",
    ),
]

INVOICE_TEMPLATE = (
    "Faktura VAT — szablon",
    """FAKTURA VAT NR {{ document_number }}
Data wystawienia: {{ document_date }}
Data sprzedaży: {{ data_sprzedazy }}

SPRZEDAWCA
{{ company_name }}
{{ company_address }}
NIP: {{ company_tax_id }}
{{ company_email }}

NABYWCA
{{ client_name }}
{{ client_address }}
NIP: {{ client_tax_id }}
{{ client_email }}

Pozycja: {{ nazwa_towaru_uslugi }}
Ilość: {{ ilosc }} {{ jednostka }}
Cena netto: {{ cena_netto }}
Stawka VAT: {{ stawka_vat }}
Wartość brutto: {{ wartosc_brutto }}
Termin płatności: {{ termin_platnosci }}
Sposób płatności: {{ sposob_platnosci }}

Do zapłaty: {{ do_zaplaty }} {{ waluta }}""",
)


class Command(BaseCommand):
    help = "Dodaje przykładowych klientów oraz szablony umów i faktury."

    @transaction.atomic
    def handle(self, *args, **options):
        clients_created = 0
        templates_created = 0

        for client_data in CLIENTS:
            _, created = Client.objects.get_or_create(
                name=client_data["name"],
                defaults=client_data,
            )
            clients_created += created

        for name, content in AGREEMENT_TEMPLATES:
            _, created = DocumentTemplate.objects.get_or_create(
                name=name,
                defaults={
                    "document_type": DocumentTemplate.DocumentType.AGREEMENT,
                    "content": content,
                    "is_active": True,
                },
            )
            templates_created += created

        name, content = INVOICE_TEMPLATE
        _, created = DocumentTemplate.objects.get_or_create(
            name=name,
            defaults={
                "document_type": DocumentTemplate.DocumentType.INVOICE,
                "content": content,
                "is_active": True,
            },
        )
        templates_created += created

        self.stdout.write(
            self.style.SUCCESS(
                f"Dodano {clients_created} przykładowych klientów i {templates_created} szablonów. "
                f"W bazie: {Client.objects.count()} klientów, "
                f"{DocumentTemplate.objects.filter(document_type=DocumentTemplate.DocumentType.AGREEMENT).count()} "
                "szablonów umów oraz "
                f"{DocumentTemplate.objects.filter(document_type=DocumentTemplate.DocumentType.INVOICE).count()} "
                "szablon faktury."
            )
        )
