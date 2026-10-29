"""Gera corridas.json e forma.json em dados/ para o painel, a partir do que o extrair.py organizou.

    uv run scripts/processar.py [pasta de dados]

Uma entrada por corrida (rua e esteira), com o resumo do atividades.csv, o que o relógio mediu (calorias, cadência,
passada, potência, esforço percebido…) e o descanso da noite anterior (sono, bateria corporal ao acordar, VFC).
Grava também dados/forma.json: VO2max e previsões de prova ao longo do tempo. As de rua levam a rota: pontos a cada
~12 m, sem os primeiros e os últimos 400 m (a rota começa e termina em casa), e o segundo de cada ponto.

Na primeira vez, grava também dados/privacidade.json: uma zona em volta de casa onde os painéis limitam a
intensidade (quantas vezes você passou), para o pico não apontar a casa. Ver zona_privada().
"""
import csv
import json
import math
import random
import statistics
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import fitdecode

DADOS = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "dados")
CORTE_M = 400  # privacidade: some com o começo e o fim de cada rota
PASSO_M = 12
GRAU = 180 / 2**31  # o FIT grava lat/lon em "semicírculos"
ZONA_M = 2200  # raio da zona de privacidade; os picos de passagem ficam até ~1,7 km de casa
DESLOCA_M = (250, 400)  # o centro salvo sai deslocado da casa, ao acaso, para a zona não apontar o endereço


def rota(fit):
    pontos = []
    with fitdecode.FitReader(fit) as fr:
        for f in fr:
            if isinstance(f, fitdecode.FitDataMessage) and f.name == "record":
                lat, lon = f.get_value("position_lat", fallback=None), f.get_value("position_long", fallback=None)
                dist = f.get_value("distance", fallback=None)
                if None not in (lat, lon, dist):
                    pontos.append((f.get_value("timestamp"), dist, lon * GRAU, lat * GRAU, f.get_value("heart_rate", fallback=None)))
    if not pontos:
        return None
    t0, total = pontos[0][0], pontos[-1][1]
    path, t, fc, ultimo = [], [], [], -PASSO_M
    for ts, dist, lon, lat, bpm in pontos:
        if CORTE_M <= dist <= total - CORTE_M and dist - ultimo >= PASSO_M:
            path.append([round(lon, 5), round(lat, 5)])
            t.append(int((ts - t0).total_seconds()))
            fc.append(bpm)
            ultimo = dist
    pontas = [[pontos[0][2], pontos[0][3]], [pontos[-1][2], pontos[-1][3]]]  # antes do corte: só para a zona privada
    # frequência cardíaca de cada ponto; sem sensor, a lista some
    return {"path": path, "t": t, **({"fc_s": fc} if any(fc) else {}), "_pontas": pontas} if len(path) > 1 else None


def zona_privada(corridas, dados):
    """Casa = mediana das largadas e chegadas na cidade onde mais se corre, antes do corte. Grava só o centro deslocado e o raio."""
    destino = dados / "privacidade.json"
    if destino.exists():  # sorteada uma vez; mudar a cada rodada deixaria comparar versões e achar a casa
        return
    cidade = Counter(c["local"] for c in corridas if "_pontas" in c).most_common(1)[0][0]
    pts = [p for c in corridas if c["local"] == cidade for p in c.get("_pontas", [])]
    lon, lat = statistics.median(p[0] for p in pts), statistics.median(p[1] for p in pts)
    r = random.SystemRandom()
    ang, dist = r.uniform(0, 2 * math.pi), r.uniform(*DESLOCA_M)
    centro = [round(lon + dist * math.cos(ang) / (math.cos(math.radians(lat)) * 111320), 5), round(lat + dist * math.sin(ang) / 110540, 5)]
    destino.write_text(json.dumps({"centro": centro, "raio_m": ZONA_M}))


def resumos():
    """O resumo de cada atividade que vem na exportação, pela hora local de início."""
    por_inicio = {}
    for f in (DADOS / "exportacao").rglob("*_summarizedActivities.json"):
        for a in json.loads(f.read_text())[0]["summarizedActivitiesExport"]:
            por_inicio[datetime.fromtimestamp(a["startTimeLocal"] / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M")] = a
    return por_inicio


def metricas(a):
    """O que o relógio mediu além de distância e tempo. Na exportação, `calories` vem em kJ."""
    m = {
        "kcal": a.get("calories") and round(a["calories"] / 4.184),
        "cadencia": a.get("avgDoubleCadence") and round(a["avgDoubleCadence"]),  # passos por minuto
        "passada": a.get("avgStrideLength") and round(a["avgStrideLength"] / 100, 2),  # metros
        "potencia": a.get("avgPower") and round(a["avgPower"]),
        "contato": a.get("avgGroundContactTime") and round(a["avgGroundContactTime"]),  # ms no chão por passo
        "te": a.get("aerobicTrainingEffect") and round(a["aerobicTrainingEffect"], 1),
        "vo2": a.get("vO2MaxValue"),
        "rpe": a.get("workoutRpe") and a["workoutRpe"] / 10,  # esforço percebido, 1 a 10
        "bateria_gasta": a.get("differenceBodyBattery") and -a["differenceBodyBattery"],
        "temp": a.get("maxTemperature"),  # sensor do relógio, no pulso: lê acima do ar
    }
    return {k: v for k, v in m.items() if v is not None}


def forma():
    """VO2max e previsões de prova (5 km, 10 km, meia) ao longo do tempo, um valor por dia."""
    met = DADOS / "exportacao" / "DI_CONNECT" / "DI-Connect-Metrics"
    vo2 = {x["calendarDate"]: x["vo2MaxValue"] for f in sorted(met.glob("MetricsMaxMetData_*.json")) for x in json.loads(f.read_text())
           if x.get("sport") == "RUNNING" and x.get("vo2MaxValue")}
    prev = {x["calendarDate"]: [x["raceTime5K"], x["raceTime10K"], x["raceTimeHalf"]] for f in sorted(met.glob("RunRacePredictions_*.json"))
            for x in json.loads(f.read_text()) if x.get("raceTime5K")}
    return {"vo2": sorted(vo2.items()), "previsoes": sorted((d, *v) for d, v in prev.items())}


def descanso():
    """Por data: horas e nota do sono da noite anterior, bateria corporal ao acordar e VFC da noite."""
    w = DADOS / "exportacao" / "DI_CONNECT"
    por_dia = {}
    for f in (w / "DI-Connect-Wellness").glob("*sleepData.json"):
        for x in json.loads(f.read_text()):
            if "deepSleepSeconds" in x:
                seg = x["deepSleepSeconds"] + x["lightSleepSeconds"] + x.get("remSleepSeconds", 0)
                por_dia.setdefault(x["calendarDate"], {}).update(sono_h=round(seg / 3600, 2), sono_nota=x["sleepScores"].get("overallScore"))
    for f in (w / "DI-Connect-Aggregator").glob("UDSFile*.json"):
        for x in json.loads(f.read_text()):
            stats = {k["bodyBatteryStatType"]: k["statsValue"] for k in (x.get("bodyBattery") or {}).get("bodyBatteryStatList", [])}
            if "SLEEPEND" in stats:
                por_dia.setdefault(x["calendarDate"], {})["bateria"] = stats["SLEEPEND"]
    for f in (w / "DI-Connect-Wellness").glob("*healthStatusData.json"):
        for x in json.loads(f.read_text()):
            vfc = next((m.get("value") for m in x["metrics"] if m["type"] == "HRV"), None)
            if vfc:
                por_dia.setdefault(x["calendarDate"], {})["vfc"] = vfc
    return por_dia


def main():
    por_inicio = resumos()
    por_dia = descanso()
    corridas = []
    for a in csv.DictReader(open(DADOS / "atividades.csv")):
        if a["esporte"] != "running" or float(a["km"]) < 0.5:
            continue
        c = {
            "data": a["inicio"],
            "nome": por_inicio.get(a["inicio"], {}).get("name"),
            "local": por_inicio.get(a["inicio"], {}).get("locationName") or "Minha cidade",
            "rua": a["gps"] == "True",
            "km": float(a["km"]),
            "min": float(a["minutos"]),
            "pace": float(a["pace_min_km"]),
            "fc": int(a["fc_media"]) if a["fc_media"] else None,
            "subida": int(a["subida_m"]) if a["subida_m"] else None,
        }
        if c["rua"]:
            c.update(rota(DADOS / "atividades" / a["arquivo"]) or {"rua": False})
        c.update(metricas(por_inicio.get(a["inicio"], {})))
        c.update(por_dia.get(a["inicio"][:10], {}))  # a noite que terminou na manhã da corrida
        corridas.append(c)
    zona_privada(corridas, DADOS)
    for c in corridas:
        c.pop("_pontas", None)
    (DADOS / "corridas.json").write_text(json.dumps(corridas, separators=(",", ":")))
    (DADOS / "forma.json").write_text(json.dumps(forma(), separators=(",", ":")))
    rua = [c for c in corridas if c["rua"]]
    print(f"{len(corridas)} corridas, {len(rua)} com rota, {sum(len(c['path']) for c in rua)} pontos")
    assert all(len(c["path"]) == len(c["t"]) for c in rua)


if __name__ == "__main__":
    main()
