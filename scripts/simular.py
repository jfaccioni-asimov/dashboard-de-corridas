"""Gera as corridas de exemplo (exemplo/): 50 corridas de rua e 6 de esteira, simuladas em Porto Alegre.

    uv run scripts/simular.py

As rotas são caminhos de verdade sobre as ruas do OpenStreetMap (Ipanema, zona sul), saindo sempre do mesmo ponto:
algumas voltas preferidas, que se repetem, e o resto variado. Pace, frequência cardíaca, sono e o resto das métricas
são sorteados com correlações simples (mais descansado, mais rápido; mais devagar, frequência menor). Nada vem de
uma pessoa real. A semente é fixa: rodar de novo dá as mesmas corridas.
"""
import heapq
import json
import math
import random
import statistics
from datetime import date, timedelta
from pathlib import Path

import processar
import ruas

EX = Path(__file__).resolve().parent.parent / "exemplo"
CASA = (-51.2325, -30.1215)  # lon, lat de onde saem todas as corridas
CAIXA = [(-51.30, -30.20), (-51.15, -30.06)]
CIDADE = "Porto Alegre"
PASSO_M = 12
CORRE = {"residential", "tertiary", "secondary", "primary", "unclassified", "living_street", "pedestrian",
         "footway", "path", "cycleway", "tertiary_link", "secondary_link", "primary_link"}
GOSTO = {"cycleway": 0.8, "pedestrian": 0.8, "footway": 0.9, "path": 0.9, "primary": 1.5, "primary_link": 1.5,
         "secondary": 1.2}  # quem corre prefere ciclovia e calçadão, foge de avenida
INICIO, FIM = date(2026, 2, 2), date(2026, 10, 20)
TEMP_MES = [31, 31, 29, 26, 22, 19, 18, 20, 22, 25, 28, 30]  # sensor de pulso: lê acima do ar
rng = random.Random(7)


def grafo():
    vias = [e for e in json.loads(ruas.osm_da_regiao(CAIXA).read_text())["elements"]
            if e["type"] == "way" and e["tags"].get("highway") in CORRE
            and e["tags"].get("access") not in ("private", "no") and e["tags"].get("foot") != "no"]
    idx, pos, adj = {}, [], []

    def no(g):
        k = (g["lon"], g["lat"])
        if k not in idx:
            idx[k] = len(pos); pos.append(k); adj.append([])
        return idx[k]
    for v in vias:
        mult = GOSTO.get(v["tags"]["highway"], 1.0)
        ns = [no(g) for g in v["geometry"]]
        for a, b in zip(ns, ns[1:]):
            if a != b:
                L = metros(pos[a], pos[b])
                adj[a].append((b, L, mult)); adj[b].append((a, L, mult))
    return pos, adj


def metros(a, b):
    return math.hypot((a[0] - b[0]) * math.cos(math.radians(a[1])) * 111320, (a[1] - b[1]) * 110540)


def dijkstra(adj, origem, peso, destino=None):
    dist, ant, fila = {origem: 0.0}, {}, [(0.0, origem)]
    while fila:
        d, u = heapq.heappop(fila)
        if d > dist[u]:
            continue
        if u == destino:
            break
        for v, L, m in adj[u]:
            nd = d + peso(u, v, L, m)
            if nd < dist.get(v, 1e18):
                dist[v], ant[v] = nd, u
                heapq.heappush(fila, (nd, v))
    if destino is None:
        return dist
    caminho = [destino]
    while caminho[-1] != origem:
        caminho.append(ant[caminho[-1]])
    return caminho[::-1]


def ruido(semente, evitar=()):
    """Peso das arestas: cada corrida enxerga as ruas um pouco diferentes; `evitar` empurra a volta para outro caminho."""
    return lambda u, v, L, m: L * m * (0.75 + 0.7 * (hash((min(u, v), max(u, v), semente)) & 0xFFFF) / 65535) \
        * (2.5 if (min(u, v), max(u, v)) in evitar else 1)


def rota(pos, adj, casa, preferidos, km):
    """Ida até um ponto de virada a ~km/2 de casa e volta por outro caminho; devolve a lista de nós."""
    destino = rng.choice(preferidos[km]) if rng.random() < 0.7 else rng.choice(alcance[km])
    ida = dijkstra(adj, casa, ruido(rng.random()), destino)
    usadas = {(min(a, b), max(a, b)) for a, b in zip(ida, ida[1:])}
    volta = dijkstra(adj, destino, ruido(rng.random(), usadas), casa)
    return ida + volta[1:]


def pontos(pos, nos, pace_min, bat):
    """Amostra o caminho a cada ~12 m, com ruído de GPS, o segundo de cada ponto e a frequência cardíaca."""
    pts = [pos[n] for n in nos]
    acum, total = [0.0], 0.0
    for a, b in zip(pts, pts[1:]):
        total += metros(a, b); acum.append(total)
    amostra, d, i = [], 0.0, 0
    while d <= total:
        while acum[i + 1] < d:
            i += 1
        f = (d - acum[i]) / ((acum[i + 1] - acum[i]) or 1)
        lon = pts[i][0] + f * (pts[i + 1][0] - pts[i][0]); lat = pts[i][1] + f * (pts[i + 1][1] - pts[i][1])
        amostra.append((d, lon + rng.gauss(0, 1.3e-5), lat + rng.gauss(0, 1.1e-5)))
        d += PASSO_M + rng.uniform(-1, 1)
    fase = rng.uniform(0, 6.28)
    t, seg = [], 0.0
    for k, (d, _, _) in enumerate(amostra):
        ritmo = pace_min * (1 + 0.05 * math.sin(d / 520 + fase) + (0.06 if d < 800 else 0) + rng.gauss(0, 0.012))
        if k:
            seg += (d - amostra[k - 1][0]) / 1000 * ritmo * 60
        t.append(seg)
    fc_base = 150 + (6.8 - pace_min) * 12 + rng.gauss(0, 3) - (bat - 60) * 0.05
    fc, atual = [], fc_base - 12
    for k, (d, _, _) in enumerate(amostra):
        alvo = fc_base - 4 + 12 * min(1, d / total) + 4 * math.sin(d / 520 + fase)
        atual += (alvo - atual) * 0.08 + rng.gauss(0, 0.8)
        fc.append(round(atual))
    return amostra, t, fc, total, seg


def descanso():
    h = min(8.6, max(4.8, rng.gauss(6.9, 0.8)))
    nota = round(min(96, max(45, 52 + (h - 5) * 10 + rng.gauss(0, 6))))
    bat = round(min(99, max(18, 28 + nota * 0.55 + rng.gauss(0, 8))))
    return {"sono_h": round(h, 2), "sono_nota": nota, "bateria": bat, "vfc": round(max(25, 46 + (bat - 60) * 0.2 + rng.gauss(0, 7)))}


def metricas(km, pace, fc, f, d, bat, esteira):
    cad = round(170 + (6.2 - pace) * 6 + rng.gauss(0, 1.5))
    m = {"kcal": round(km * (62 + rng.gauss(0, 3))), "cadencia": cad, "passada": round(1000 / pace / cad, 2),
         "potencia": round(85 + 840 / pace + rng.gauss(0, 6)), "contato": round(270 - (6.5 - pace) * 12 + rng.gauss(0, 6)),
         "te": round(min(4.8, max(1.8, 1.9 + km * 0.14 + (fc - 150) * 0.02 + rng.gauss(0, 0.2))), 1),
         "vo2": round(44 + 4.5 * f + rng.gauss(0, 0.4)), "rpe": int(min(9, max(2, round(3 + km / 7 + (fc - 150) / 10 + rng.gauss(0, 0.8))))),
         "bateria_gasta": round(max(2, km * 1.8 + rng.gauss(0, 3))), "temp": round(TEMP_MES[d.month - 1] + (5 if esteira else 0) + rng.gauss(0, 2))}
    return m


def forma(datas):
    vo2, prev, d = [], [], datas[0]
    while d <= datas[-1]:
        f = (d - datas[0]).days / (datas[-1] - datas[0]).days
        v = round(44 + 4.5 * f * (2 - f) + rng.gauss(0, 0.25))  # sobe rápido no começo, devagar depois
        vo2.append((d.isoformat(), v))
        c5 = 1530 - 38 * (v - 44)
        prev.append((d.isoformat(), round(c5), round(c5 * 2.1), round(c5 * 4.62)))
        d += timedelta(days=7)
    return {"vo2": vo2, "previsoes": prev}


def main():
    global alcance
    EX.mkdir(exist_ok=True)
    ruas.DADOS = EX
    pos, adj = grafo()
    for casa in sorted(range(len(pos)), key=lambda n: metros(pos[n], CASA)):  # o mais perto que esteja na malha principal
        base = dijkstra(adj, casa, lambda u, v, L, m: L)
        if len(base) > len(pos) / 2:
            break
    alcance = {km: [n for n, d in base.items() if 0.9 * km * 500 <= d <= 1.1 * km * 500] for km in (5, 8, 12, 16)}
    preferidos = {km: rng.sample(ns, 2) for km, ns in alcance.items()}

    dias = sorted(rng.sample([INICIO + timedelta(days=i) for i in range((FIM - INICIO).days + 1)], 56))
    esteira = set(rng.sample(range(56), 6))
    corridas, nr = [], 0
    for i, dia in enumerate(dias):
        f = (dia - INICIO).days / (FIM - INICIO).days
        hora = (rng.randint(6, 7), rng.randrange(0, 60, 5)) if rng.random() < 0.7 else (rng.randint(18, 19), rng.randrange(0, 60, 5))
        c = {"data": f"{dia.isoformat()} {hora[0]:02d}:{hora[1]:02d}"}
        desc = descanso()
        longa = rng.choices([5, 8, 12, 16], weights=[34, 26, 16, 4 + 8 * f])[0]
        if i in esteira:
            longa = rng.choice([5, 8])
        pace = (6.55 - 0.85 * f + {5: -0.1, 8: 0.0, 12: 0.15, 16: 0.25}[longa] + rng.gauss(0, 0.15)) \
            * (1 - (desc["bateria"] - 60) * 0.0012)
        if i in esteira:
            km = round(longa * rng.uniform(0.8, 1.1), 2); mins = round(km * pace, 1)
            fc = round(150 + (6.8 - pace) * 12 + rng.gauss(0, 3))
            c.update(nome="Corrida em esteira", local=None, rua=False, km=km, min=mins, pace=round(mins / km, 2), fc=fc, subida=0)
            c.update(metricas(km, pace, fc, f, dia, desc["bateria"], True))
        else:
            nos = rota(pos, adj, casa, preferidos, longa)
            amostra, t, fcs, total, seg = pontos(pos, nos, pace, desc["bateria"])
            km, mins = round(total / 1000, 2), round(seg / 60, 1)
            cortadas = [(a, k) for k, a in enumerate(amostra) if processar.CORTE_M <= a[0] <= total - processar.CORTE_M]
            fc = round(statistics.mean(fcs))
            c.update(nome=f"{CIDADE} Corrida", local=CIDADE, rua=True, km=km, min=mins, pace=round(mins / km, 2), fc=fc,
                     subida=round(km * 5 + rng.gauss(0, 6)),
                     path=[[round(a[1], 5), round(a[2], 5)] for a, _ in cortadas],
                     t=[round(t[k] - t[cortadas[0][1]]) for _, k in cortadas], fc_s=[fcs[k] for _, k in cortadas],
                     _pontas=[list(CASA), list(CASA)])
            c.update(metricas(km, mins / km, fc, f, dia, desc["bateria"], False))
            nr += 1
        c.update(desc)
        corridas.append(c)

    processar.zona_privada(corridas, EX)
    for c in corridas:
        c.pop("_pontas", None)
    (EX / "corridas.json").write_text(json.dumps(corridas, separators=(",", ":"), ensure_ascii=False))
    (EX / "forma.json").write_text(json.dumps(forma(dias), separators=(",", ":")))
    print(f"{len(corridas)} corridas, {nr} de rua, {sum(len(c.get('path', [])) for c in corridas)} pontos")
    ruas.main()
    assert nr == 50 and all(len(c["path"]) == len(c["t"]) == len(c["fc_s"]) for c in corridas if c["rua"])


if __name__ == "__main__":
    main()
