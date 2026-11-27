"""Create a portable, credential-free checkout from the committed main branch."""
from pathlib import Path
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
target = root / "dist" / "downloads" / "velocity-syndicate-3d.zip"
target.parent.mkdir(parents=True, exist_ok=True)

with tempfile.TemporaryDirectory() as temp:
    repo = Path(temp) / "velocity-syndicate-3d"
    subprocess.run(["git", "clone", "--quiet", "--no-local", "--single-branch",
                    "--branch", "main", str(root), str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "remote", "remove", "origin"], check=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(repo.rglob("*")):
            rel = path.relative_to(repo)
            if rel.parts[:2] in {(".git", "hooks"), (".git", "logs")}:
                continue
            if path.is_file():
                archive.write(path, Path(repo.name) / rel)
print(target)
