import importlib.util
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
MANAGE_PY = BASE_DIR / "manage.py"
REQUIREMENTS = BASE_DIR / "requirements.txt"
REQUIRED_MODULES = ("django", "docx", "reportlab")
FRONTEND_DIR = BASE_DIR / "frontend"


def run_command(command):
    return subprocess.run(command, cwd=BASE_DIR).returncode


def npm_command(*args):
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if npm is None:
        print("Nie znaleziono npm. Zainstaluj Node.js LTS i uruchom ponownie.", file=sys.stderr)
        return 1
    return subprocess.run([npm, *args], cwd=FRONTEND_DIR).returncode


def install_missing_dependencies():
    missing = [module for module in REQUIRED_MODULES if importlib.util.find_spec(module) is None]
    if not missing:
        return 0

    print(f"Brak zależności: {', '.join(missing)}. Instaluję pakiety z requirements.txt...", flush=True)
    return run_command([sys.executable, "-m", "pip", "install", "-r", str(REQUIREMENTS)])


def build_frontend():
    package_json = FRONTEND_DIR / "package.json"
    package_lock = FRONTEND_DIR / "package-lock.json"
    install_marker = FRONTEND_DIR / "node_modules" / ".package-lock.json"
    if (
        not (FRONTEND_DIR / "node_modules").is_dir()
        or not install_marker.is_file()
        or package_json.stat().st_mtime > install_marker.stat().st_mtime
        or package_lock.stat().st_mtime > install_marker.stat().st_mtime
    ):
        print("Instaluję zależności Vue z frontend/package.json...", flush=True)
        result = npm_command("install")
        if result:
            return result

    print("Buduję frontend Vue...", flush=True)
    return npm_command("run", "build")


def main():
    os.environ.setdefault("DJANGO_DEBUG", "1")
    if os.environ["DJANGO_DEBUG"] == "1":
        os.environ.setdefault("DJANGO_SECRET_KEY", secrets.token_urlsafe(50))

    result = install_missing_dependencies()
    if result:
        return result

    result = build_frontend()
    if result:
        return result

    result = run_command([sys.executable, str(MANAGE_PY), "migrate", "--noinput"])
    if result:
        return result

    return run_command([sys.executable, str(MANAGE_PY), "runserver", *sys.argv[1:]])


if __name__ == "__main__":
    sys.exit(main())
