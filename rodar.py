"""Importa a exportação do Garmin (se houver) e abre o painel.

    uv run rodar.py

1. Se há um zip em importar/ mais novo que os dados já gerados, roda scripts/extrair.py, processar.py e ruas.py.
2. Serve a pasta em http://127.0.0.1:8765 e abre o painel no navegador. Ctrl+C encerra.

Sem dados seus (dados/), o painel mostra as corridas de exemplo (exemplo/).
"""
import functools
import subprocess
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PORTA = 8765


class Quieto(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def importar():
    zips = sorted((RAIZ / "importar").glob("*.zip"), key=lambda z: z.stat().st_mtime)
    pronto = RAIZ / "dados" / "ruas.json"
    if not zips:
        if not pronto.exists():
            print("Nenhum zip em importar/: mostrando as corridas de exemplo.")
        return
    if pronto.exists() and zips[-1].stat().st_mtime < pronto.stat().st_mtime:
        return  # já importado
    print(f"Importando {zips[-1].name}…")
    for script, *args in (["extrair.py", str(zips[-1])], ["processar.py"], ["ruas.py"]):
        subprocess.run([sys.executable, str(RAIZ / "scripts" / script), *args], check=True)


def main():
    importar()
    url = f"http://127.0.0.1:{PORTA}/painel/"
    servidor = ThreadingHTTPServer(("127.0.0.1", PORTA), functools.partial(Quieto, directory=RAIZ))
    print(f"Painel em {url} (Ctrl+C encerra)")
    webbrowser.open(url)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
