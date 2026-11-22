import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: fileURLToPath(new URL("../../tests/e2e", import.meta.url)),
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "retain-on-failure",
  },
  globalSetup: fileURLToPath(new URL("../../tests/e2e/global-setup.js", import.meta.url)),
  webServer: {
    command: `"${process.env.PYTHON || "python"}" ../manage.py runserver 127.0.0.1:8000 --noreload`,
    cwd: "..",
    url: "http://127.0.0.1:8000/api/session/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
