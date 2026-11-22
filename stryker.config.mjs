export default {
  testRunner: "vitest",
  reporters: ["clear-text", "progress"],
  mutate: ["frontend/src/api.js"],
  vitest: {
    configFile: "frontend/vite.mutation.config.js",
    related: false,
  },
  ignorePatterns: [
    ".venv",
    "config",
    "db.sqlite3",
    "documents",
    "media",
    "static",
    "templates",
    "tests/e2e",
    "tests/integration",
    "tests/unit",
  ],
  coverageAnalysis: "perTest",
  thresholds: {
    high: 80,
    low: 60,
    break: 95,
  },
};
