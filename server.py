from pathlib import Path

from flask import Flask, send_from_directory
from waitress import serve

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"

app = Flask(__name__, static_folder=None)


@app.get("/")
def index():
    return send_from_directory(WEB, "index.html")


@app.get("/<path:path>")
def static_files(path: str):
    return send_from_directory(WEB, path)


if __name__ == "__main__":
    serve(app, host="127.0.0.1", port=8766, threads=4)
