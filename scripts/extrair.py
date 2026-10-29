"""Organiza a exportação oficial do Garmin em dados/.

    uv run scripts/extrair.py <zip da exportação>

1. Extrai o zip em dados/exportacao/ (os JSON de sono, saúde, recordes, resumo das atividades).
2. Os arquivos do relógio (FIT) vêm num zip dentro do zip. Os de atividade vão para dados/atividades/, com nome
   AAAA-MM-DD_HHMM_esporte.fit (hora de Brasília); o resto (monitoramento do dia a dia) fica em dados/monitoramento/.
3. Grava dados/atividades.csv: uma linha por atividade, com esporte, distância, duração, pace e se tem GPS.
"""
import csv
import shutil
import sys
import zipfile
from pathlib import Path
from zoneinfo import ZoneInfo

import fitdecode

DADOS = Path(__file__).resolve().parent.parent / "dados"
FUSO = ZoneInfo("America/Sao_Paulo")  # o FIT grava em UTC


def extrair_seguro(zip_path, destino):
    with zipfile.ZipFile(zip_path) as z:
        if any(n.startswith("/") or ".." in n.split("/") for n in z.namelist()):
            sys.exit(f"{zip_path}: caminho suspeito dentro do zip")
        z.extractall(destino)


def ler_atividade(fit):
    """Devolve o resumo da sessão, ou None se o arquivo não for de atividade."""
    s, gps = None, False
    with fitdecode.FitReader(fit) as fr:
        for f in fr:
            if not isinstance(f, fitdecode.FitDataMessage):
                continue
            if f.name == "file_id" and f.get_value("type", fallback=None) != "activity":
                return None
            if f.name == "session":
                s = f
            if f.name == "record" and not gps and f.get_value("position_lat", fallback=None) is not None:
                gps = True
    if s is None:
        return None
    v = lambda k: s.get_value(k, fallback=None)
    km = (v("total_distance") or 0) / 1000
    min_ = (v("total_timer_time") or 0) / 60
    return {
        "inicio": v("start_time").astimezone(FUSO).strftime("%Y-%m-%d %H:%M"),
        "esporte": v("sport"),
        "subesporte": v("sub_sport"),
        "km": round(km, 2),
        "minutos": round(min_, 1),
        "pace_min_km": round(min_ / km, 2) if km else None,
        "fc_media": v("avg_heart_rate"),
        "subida_m": v("total_ascent"),
        "gps": gps,
    }


def main():
    zip_export = Path(sys.argv[1]).resolve()
    for pasta in ("exportacao", "atividades", "monitoramento"):
        shutil.rmtree(DADOS / pasta, ignore_errors=True)
    extrair_seguro(zip_export, DADOS / "exportacao")
    brutos = DADOS / "exportacao" / "_fit"
    for z in (DADOS / "exportacao").rglob("UploadedFiles_*.zip"):
        extrair_seguro(z, brutos)

    (DADOS / "atividades").mkdir()
    (DADOS / "monitoramento").mkdir()
    linhas = []
    for fit in sorted(brutos.rglob("*.fit")):
        try:
            a = ler_atividade(fit)
        except fitdecode.FitError:
            a = None
        if a is None:
            fit.rename(DADOS / "monitoramento" / fit.name.split("_")[-1])
            continue
        nome = f"{a['inicio'].replace(' ', '_').replace(':', '')}_{a['esporte']}"
        if a["subesporte"] not in (None, "generic"):
            nome += f"-{a['subesporte']}"
        destino = DADOS / "atividades" / f"{nome}.fit"
        n = 2
        while destino.exists():  # duas atividades no mesmo minuto
            destino = destino.with_stem(f"{nome}-{n}")
            n += 1
        fit.rename(destino)
        linhas.append({"arquivo": destino.name, **a})
    shutil.rmtree(brutos)

    linhas.sort(key=lambda a: a["inicio"])
    with open(DADOS / "atividades.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=linhas[0].keys())
        w.writeheader()
        w.writerows(linhas)
    corridas = [a for a in linhas if a["esporte"] == "running" and a["gps"]]
    print(f"{len(linhas)} atividades, {len(corridas)} corridas com GPS, de {linhas[0]['inicio']} a {linhas[-1]['inicio']}")


if __name__ == "__main__":
    main()
