import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
GROUPS = ("unit", "integration", "e2e", "mutation", "pentest")


def run_group(group, npm):
    if group in ("integration", "pentest"):
        command = [sys.executable, str(PROJECT_ROOT / "manage.py"), "test", f"tests.{group}"]
        cwd = PROJECT_ROOT
    else:
        npm_scripts = {
            "unit": ("test",),
            "e2e": ("run", "test:e2e"),
            "mutation": ("run", "test:mutation"),
        }
        command = [npm, *npm_scripts[group]]
        cwd = FRONTEND_DIR

    print(f"\n=== {group.upper()} ===", flush=True)
    environment = os.environ.copy()
    environment["PYTHON"] = sys.executable
    environment["DJANGO_DEBUG"] = "1"
    environment["DJANGO_SECRET_KEY"] = "tests-only-key-not-for-deployment"
    try:
        if group == "e2e":
            print("Buduję frontend wymagany przez testy E2E...", flush=True)
            build_result = subprocess.run([npm, "run", "build"], cwd=cwd, env=environment)
            if build_result.returncode:
                return build_result.returncode
        return subprocess.run(command, cwd=cwd, env=environment).returncode
    except OSError as error:
        print(f"Nie udało się uruchomić grupy {group}: {error}", file=sys.stderr, flush=True)
        return 1


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Uruchamia osobno lub łącznie testy jednostkowe, integracyjne, E2E, "
            "mutacyjne i penetracyjne."
        )
    )
    parser.add_argument(
        "group",
        nargs="?",
        choices=("all", *GROUPS),
        default="all",
        help="grupa testów do uruchomienia (domyślnie: all)",
    )
    args = parser.parse_args()
    selected_groups = GROUPS if args.group == "all" else (args.group,)
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")

    results = []
    for group in selected_groups:
        if group not in ("integration", "pentest") and npm is None:
            print("Nie znaleziono npm. Zainstaluj Node.js LTS, aby uruchomić testy Vue.", file=sys.stderr)
            results.append((group, 1))
            continue
        results.append((group, run_group(group, npm)))

    print("\n=== PODSUMOWANIE ===")
    for group, result in results:
        status = "OK" if result == 0 else f"BŁĄD (kod {result})"
        print(f"{group.upper():<12} {status}")

    return int(any(result != 0 for _, result in results))


if __name__ == "__main__":
    sys.exit(main())
