"""Cruza as rotas com as ruas do OpenStreetMap: quais ruas você já correu e quantas vezes.

    uv run scripts/ruas.py [pasta de dados]

Pega a cidade onde mais se corre, baixa da Overpass a malha de ruas da região das rotas (uma vez, em osm-*.json na
pasta de dados) e gera ruas.json para o painel. Cada trecho guarda também o pace mediano de quem passou por ele (em ~200 m em volta), quando três corridas ou mais
passaram. Um trecho de rua conta como corrido quando um ponto da rota passa a menos de RAIO_M dele, andando na
mesma direção da rua (quem só cruza a esquina não acende a transversal).

Privacidade: dentro da zona de dados/privacidade.json (gravada pelo processar.py), o número de passagens de cada
trecho fica limitado ao maior número fora dela. A rota inteira continua lá; só o pico perto de casa não se destaca.
"""
import json
import math
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

DADOS = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "dados")
MARGEM_GRAU = 0.02  # ~2 km em volta das rotas
RAIO_M = 18
PASSO_M = 10
CELULA = 25
# o que não é rua de verdade, ou repete outra (corredor de ônibus ao lado da avenida)
FORA = {"platform", "proposed", "construction", "busway", "dummy", "services", "rest_area", "elevator", "corridor"}
# o que conta como "rua" na pergunta "quantas ruas eu já corri?"
RUA = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "trunk", "pedestrian"}
CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street",
           "pedestrian", "service", "footway", "path", "cycleway", "steps", "track", "outra"]

LON0 = LAT0 = KX = KY = None  # origem local em metros, no centro das rotas (main)


def xy(lon, lat):
    return (lon - LON0) * KX, (lat - LAT0) * KY


def baixar(caixa, destino):
    """Todas as vias dentro da caixa (sul, oeste, norte, leste), em múltiplos de 0,05° para o cache servir de novo."""
    q = f'[out:json][timeout:240];way["highway"]({",".join(map(str, caixa))});out geom;'
    req = urllib.request.Request("https://overpass-api.de/api/interpreter",
                                 data=urllib.parse.urlencode({"data": q}).encode(),
                                 headers={"User-Agent": "dashboard-de-corridas/1.0"})
    for tentativa in range(4):  # a Overpass é pública e às vezes devolve 502/504 por excesso de pedidos
        try:
            return destino.write_bytes(urllib.request.urlopen(req, timeout=300).read())
        except urllib.error.HTTPError as e:
            print(f"Overpass respondeu {e.code}; tentando de novo em {30 * (tentativa + 1)} s…")
            time.sleep(30 * (tentativa + 1))
    sys.exit("A Overpass não respondeu. Rode de novo daqui a alguns minutos.")


def osm_da_regiao(pontos):
    lons, lats = [p[0] for p in pontos], [p[1] for p in pontos]
    arred = lambda v, f: round(f(v / 0.05) * 0.05, 2)
    caixa = (arred(min(lats) - MARGEM_GRAU, math.floor), arred(min(lons) - MARGEM_GRAU, math.floor),
             arred(max(lats) + MARGEM_GRAU, math.ceil), arred(max(lons) + MARGEM_GRAU, math.ceil))
    arq = DADOS / ("osm-" + "_".join(map(str, caixa)) + ".json")
    if not arq.exists():
        print(f"baixando as ruas da região {caixa} no OpenStreetMap…")
        baixar(caixa, arq)
    return arq


def pace_local(p, t, k, janela=8):
    """Pace (min/km) em ~200 m em volta do ponto k; None se o relógio pausou ou o GPS pulou."""
    a, b = max(0, k - janela), min(len(p) - 1, k + janela)
    dist = sum(math.dist(p[j], p[j + 1]) for j in range(a, b))
    pace = (t[b] - t[a]) / 60 / (dist / 1000) if dist > 50 else None
    return pace if pace and 3.3 <= pace <= 11 else None


def indice(corridas):
    """Grade de CELULA m com (corrida, ponto, direção, pace local) de cada ponto das rotas."""
    grade = defaultdict(list)
    for i, c in enumerate(corridas):
        p = [xy(*q) for q in c["path"]]
        for k, (x, y) in enumerate(p):
            a, b = p[max(k - 1, 0)], p[min(k + 1, len(p) - 1)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            n = math.hypot(dx, dy) or 1
            grade[(int(x // CELULA), int(y // CELULA))].append((i, x, y, dx / n, dy / n, pace_local(p, c["t"], k)))
    return grade


def quem_passou(grade, x, y, ux, uy):
    """{corrida: pace local} de quem passou pela amostra na direção da rua."""
    s = {}
    cx, cy = int(x // CELULA), int(y // CELULA)
    for gx in (cx - 1, cx, cx + 1):
        for gy in (cy - 1, cy, cy + 1):
            for i, px, py, dx, dy, pace in grade.get((gx, gy), ()):
                if (px - x) ** 2 + (py - y) ** 2 <= RAIO_M ** 2 and abs(dx * ux + dy * uy) >= 0.7:
                    if s.get(i) is None:
                        s[i] = pace
    return s


def amostras(geom):
    """Pontos a cada PASSO_M ao longo da via, com a direção do trecho."""
    pts = [xy(g["lon"], g["lat"]) for g in geom]
    out = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        if not L:
            continue
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        for k in range(max(1, round(L / PASSO_M))):
            f = (k + 0.5) / max(1, round(L / PASSO_M))
            out.append((x0 + f * (x1 - x0), y0 + f * (y1 - y0), ux, uy, L / max(1, round(L / PASSO_M))))
    return out


def lonlat(x, y):
    return [round(x / KX + LON0, 5), round(y / KY + LAT0, 5)]


def delta(coords):
    """[x0, y0, dx1, dy1, …] em 1e-5 grau: metade do tamanho do JSON."""
    out, px, py = [], 0, 0
    for lon, lat in coords:
        x, y = round(lon * 1e5), round(lat * 1e5)
        out += [x - px, y - py]
        px, py = x, y
    return out


def limitar_perto_de_casa(acesas):
    """Limita `n` dentro da zona privada ao maior `n` fora dela; marca os trechos limitados com z=1."""
    arq = DADOS / "privacidade.json"
    zona = json.loads(arq.read_text()) if arq.exists() else None
    for a in acesas:
        meio = a.pop("_meio")
        a["_dentro"] = bool(zona) and math.dist(meio, xy(*zona["centro"])) < zona["raio_m"]
    teto = max((a["n"] for a in acesas if not a["_dentro"]), default=None)
    for a in acesas:
        if a.pop("_dentro") and a["n"] > teto:
            a["n"], a["z"] = teto, 1
    return teto


def main():
    global LON0, LAT0, KX, KY
    todas = json.loads((DADOS / "corridas.json").read_text())
    CIDADE = Counter(c["local"] for c in todas if c["rua"]).most_common(1)[0][0]
    corridas = sorted((c for c in todas if c["rua"] and c["local"] == CIDADE), key=lambda c: c["data"])
    pontos = [p for c in corridas for p in c["path"]]
    LON0, LAT0 = round(statistics.median(p[0] for p in pontos), 3), round(statistics.median(p[1] for p in pontos), 3)
    KX, KY = math.cos(math.radians(LAT0)) * 111320, 110540
    vias = [e for e in json.loads(osm_da_regiao(pontos).read_text())["elements"]
            if e["type"] == "way" and e["tags"].get("highway") not in FORA]
    grade = indice(corridas)

    base, acesas = [], []
    por_nome = defaultdict(lambda: [0.0, 0.0])  # nome: [metros, metros corridos]
    total_m = corrido_m = 0.0
    for v in vias:
        hw = v["tags"]["highway"]
        cls = CLASSES.index(hw) if hw in CLASSES else (CLASSES.index(hw.split("_")[0]) if hw.split("_")[0] in CLASSES else len(CLASSES) - 1)
        base.append([cls] + delta([(g["lon"], g["lat"]) for g in v["geometry"]]))
        trecho = []  # amostras seguidas que alguma corrida cobriu
        for x, y, ux, uy, L in amostras(v["geometry"]) + [(None,) * 5]:  # a sentinela fecha o último trecho
            s = quem_passou(grade, x, y, ux, uy) if x is not None else {}
            if x is not None:
                total_m += L
                nome = v["tags"].get("name") if hw in RUA else None
                if nome:
                    por_nome[nome][0] += L
                if s:
                    corrido_m += L
                    if nome:
                        por_nome[nome][1] += L
                    trecho.append((x - ux * L / 2, y - uy * L / 2, x + ux * L / 2, y + uy * L / 2, s))
                    continue
            if trecho:
                coords = [lonlat(trecho[0][0], trecho[0][1])] + [lonlat(t[2], t[3]) for t in trecho]
                runs = set().union(*(t[4] for t in trecho))
                n = round(sum(len(t[4]) for t in trecho) / len(trecho))
                paces = [v for t in trecho for v in t[4].values() if v]
                acesas.append({"c": cls, "n": n, "primeira": min(runs), "p": delta(coords), "_meio": trecho[len(trecho) // 2][:2],
                               "pace": round(statistics.median(paces), 2) if n >= 3 and len(paces) >= 3 else None,
                               "cs": sorted(runs)})  # as corridas que passaram (índices na ordem por data)
                trecho = []

    teto = limitar_perto_de_casa(acesas)
    ruas_corridas = {k: v for k, v in por_nome.items() if v[1] >= min(200, 0.5 * v[0])}
    resumo = {
        "cidade": CIDADE,
        "origem": [LON0, LAT0],
        "corridas": len(corridas),
        "datas": [c["data"][:10] for c in corridas],
        "km_corridas": round(sum(c["km"] for c in corridas), 1),
        "ruas_total": len(por_nome),
        "ruas_corridas": len(ruas_corridas),
        "malha_km": round(total_m / 1000),
        "malha_corrida_km": round(corrido_m / 1000, 1),
        "teto_n": teto,
        "regra": f"rua corrida = pelo menos 200 m dela (ou metade, se for mais curta) a menos de {RAIO_M} m da rota",
    }
    (DADOS / "ruas.json").write_text(json.dumps({"resumo": resumo, "classes": CLASSES, "base": base, "acesas": acesas},
                                                separators=(",", ":")))
    print(json.dumps({k: v for k, v in resumo.items() if k != "datas"}, ensure_ascii=False, indent=1))
    print(f"{len(base)} vias, {len(acesas)} trechos acesos")
    assert 0 < resumo["ruas_corridas"] < resumo["ruas_total"] and corrido_m < total_m


if __name__ == "__main__":
    main()
