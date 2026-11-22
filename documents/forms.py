import re

from django import forms

from .models import Client, DocumentTemplate

SYSTEM_FIELDS = {
    "company_name",
    "company_address",
    "company_tax_id",
    "company_email",
    "company_phone",
    "client_name",
    "client_address",
    "client_tax_id",
    "client_email",
    "client_phone",
    "document_number",
    "document_date",
    "title",
}


class ClientForm(forms.ModelForm):
    class Meta:
        model = Client
        fields = ["name", "address", "tax_id", "email", "phone"]


class TemplateForm(forms.ModelForm):
    class Meta:
        model = DocumentTemplate
        fields = ["name", "document_type", "content", "is_active"]
        widgets = {"content": forms.Textarea(attrs={"rows": 16})}


class DocumentGenerationForm(forms.Form):
    template = forms.ModelChoiceField(
        queryset=DocumentTemplate.objects.none(),
        label="Szablon",
    )
    client = forms.ModelChoiceField(
        queryset=Client.objects.none(),
        label="Klient",
    )
    title = forms.CharField(max_length=200, label="Tytuł dokumentu")

    def __init__(self, *args, template=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["template"].queryset = DocumentTemplate.objects.filter(is_active=True)
        self.fields["client"].queryset = Client.objects.all()
        if template:
            self.fields["template"].initial = template
            self.fields["template"].widget = forms.HiddenInput()
            self.fields["template"].required = False
            for key in sorted(set(re.findall(r"{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}", template.content)) - SYSTEM_FIELDS):
                self.fields[key] = forms.CharField(
                    label=key.replace("_", " ").capitalize(),
                    required=False,
                    widget=forms.TextInput(attrs={"placeholder": f"Wartość dla pola „{key}”"}),
                )
