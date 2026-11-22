import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function globalSetup() {
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  const managePy = fileURLToPath(new URL("../../manage.py", import.meta.url));
  const result = spawnSync(
    process.env.PYTHON || "python",
    [managePy, "migrate", "--noinput"],
    { cwd: projectRoot, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Nie udało się przygotować bazy danych dla testów E2E.");
}
