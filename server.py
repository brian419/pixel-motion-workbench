from __future__ import annotations

import re
import subprocess
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from waitress import serve

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"

app = Flask(__name__, static_folder=None)
_selected_output_directory: Path | None = None


def _choose_output_folder() -> Path | None:
    script = 'POSIX path of (choose folder with prompt "Choose where animation frames should be saved")'
    completed = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if completed.returncode == 0:
        path = Path(completed.stdout.strip()).expanduser()
        if path.is_dir():
            return path.resolve()
        raise RuntimeError("The selected folder is invalid.")

    error_text = completed.stderr.strip()
    if "User canceled" in error_text or "(-128)" in error_text:
        return None
    raise RuntimeError(error_text or "Could not open the folder chooser.")


def _safe_output_name(requested: str) -> str:
    name = Path((requested or "motion-frame.png").strip()).name
    if not name.lower().endswith(".png"):
        name += ".png"
    stem = Path(name).stem
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "-", stem).strip(" .") or "motion-frame"
    return f"{stem[:120]}.png"


@app.get("/")
def index():
    return send_from_directory(WEB, "index.html")


@app.post("/api/choose-folder")
def choose_folder():
    global _selected_output_directory
    try:
        selected = _choose_output_folder()
        if selected is None:
            return jsonify({"cancelled": True})
        _selected_output_directory = selected
        return jsonify({"cancelled": False, "path": str(selected), "name": selected.name or str(selected)})
    except (RuntimeError, subprocess.TimeoutExpired) as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/export-frame")
def export_frame():
    if _selected_output_directory is None:
        return jsonify({"error": "Choose an output folder before exporting."}), 400

    upload = request.files.get("frame")
    if upload is None:
        return jsonify({"error": "No candidate frame was provided."}), 400

    output_name = _safe_output_name(request.form.get("output_name", "motion-frame.png"))
    output_path = _selected_output_directory / output_name
    upload.save(output_path)
    return jsonify({"saved": True, "filename": output_name, "path": str(output_path)})


@app.get("/<path:path>")
def static_files(path: str):
    return send_from_directory(WEB, path)


if __name__ == "__main__":
    serve(app, host="127.0.0.1", port=8766, threads=4)
