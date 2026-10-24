#!/usr/bin/env python3
"""Servidor de desarrollo para probar el marco en el iPad por la red local.

Sirve los archivos del proyecto (sin caché, para que el iPad vea siempre la
última versión) y acepta POST /__reporte, donde la app envía su registro de
diagnóstico. Cada línea se añade a reports/ipad-log.jsonl, que se puede leer
desde el Mac sin copiar nada a mano en el iPad.

Solo para la red local. GitHub Pages no tiene este endpoint, así que en la
versión publicada no se envía nada.

Uso: python3 tools/dev-server.py [puerto]
"""
import json
import os
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_DIR = os.path.join(ROOT, "reports")
LOG_FILE = os.path.join(LOG_DIR, "ipad-log.jsonl")
MAX_BODY = 16 * 1024


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path != "/__reporte":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self.send_error(413)
            return
        try:
            entry = json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError:
            self.send_error(400)
            return
        record = {
            "recibido": time.strftime("%Y-%m-%d %H:%M:%S"),
            "desde": self.client_address[0],
            "ua": self.headers.get("User-Agent", ""),
        }
        if isinstance(entry, dict):
            record.update(entry)
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        mark = "ERROR " if record.get("error") else ""
        print(f"[iPad {record['desde']}] {mark}{record.get('texto', '')}", flush=True)
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        # Solo mostrar errores de archivos; los GET normales son ruido.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
    print(f"Sirviendo {ROOT} en http://0.0.0.0:{port} — registro en {LOG_FILE}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
