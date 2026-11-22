import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function globalSetup() {
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  const managePy = fileURLToPath(new URL("../../manage.py", import.meta.url));
  const environment = {
    ...process.env,
    DJANGO_DEBUG: "1",
    DJANGO_SECRET_KEY: process.env.DJANGO_SECRET_KEY || "tests-only-key-not-for-deployment",
  };
  const result = spawnSync(
    process.env.PYTHON || "python",
    [managePy, "migrate", "--noinput"],
    { cwd: projectRoot, env: environment, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Nie udało się przygotować bazy danych dla testów E2E.");

  const setupCommands = [
    [managePy, "load_sample_data"],
    [
      managePy,
      "shell",
      "-c",
      "from django.contrib.auth import get_user_model; U=get_user_model(); u,_=U.objects.get_or_create(username='e2e-admin'); u.set_password('E2e-Test-123!'); u.is_staff=True; u.save()",
    ],
    [
      managePy,
      "shell",
      "-c",
      "from documents.models import CompanyProfile; CompanyProfile.objects.get_or_create(name='Firma E2E', defaults={'address':'ul. Testowa 10','tax_id':'0000000000','email':'e2e@example.com','phone':'000 000 000'})",
    ],
  ];

  for (const command of setupCommands) {
    const setup = spawnSync(process.env.PYTHON || "python", command, {
      cwd: projectRoot,
      env: environment,
      stdio: "inherit",
    });
    if (setup.error) throw setup.error;
    if (setup.status !== 0) throw new Error("Nie udało się przygotować danych dla testów E2E.");
  }
}
