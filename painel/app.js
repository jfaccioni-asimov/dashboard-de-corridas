// Painel de corridas: o mapa com os painéis e todas as análises.
import { carregar, ORIGEM, BASE, EXEMPLO, CIDADE, params, xy, fmtNum, fmtPace, fmtData, faixa, relogio } from './comum.js';
import { COR as C, el, plano, eixoY, eixoX, rotulo, ponto, barra, media, quartis } from './graficos.js';

const { todas, corridas, ruas, zona } = await carregar();
const forma = await fetch(new URL(BASE + 'forma.json', import.meta.url)).then(r => r.json());
const R = ruas.resumo, N = corridas.length;
const $ = id => document.getElementById(id);

// pace relativo ao normal dele: 10.º percentil verde-água, mediana lilás, 90.º laranja (o mesmo no mapa e nos gráficos)
const qs = (arr, f) => { const o = arr.slice().sort((a, b) => a - b); return o[Math.floor(f * (o.length - 1))]; };
const tp = ruas.acesas.map(a => a.pace).filter(Boolean), cp = corridas.map(c => c.pace);
const RAMPA = ['#2dd4bf', '#7ee0cf', '#c4b5fd', '#f0abfc', '#fb923c'];
const escala = vals => [0.1, 0.3, 0.5, 0.7, 0.9].map((f, i) => [qs(vals, f), RAMPA[i]]);
const PACE_TRECHO = escala(tp), PACE_CORRIDA = escala(cp);
const mistura = (a, b, f) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - f) + parseInt(b.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');
const corEm = (E, p) => { if (p <= E[0][0]) return E[0][1]; for (let i = 1; i < E.length; i++) if (p <= E[i][0]) return mistura(E[i - 1][1], E[i][1], (p - E[i - 1][0]) / (E[i][0] - E[i - 1][0])); return E.at(-1)[1]; };
const corPace = p => corEm(PACE_CORRIDA, p);
const zc = zona && xy(zona.centro), naZona = p => !!zona && Math.hypot(xy(p)[0] - zc[0], xy(p)[1] - zc[1]) < zona.raio_m;
const fmtMin = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ---------- faixa de cima: o nome e sete números (número grande, rótulo pequeno embaixo) ----------
const kmTotal = corridas.reduce((s, c) => s + c.km, 0), paceMedio = corridas.reduce((s, c) => s + c.min, 0) / kmTotal;
$('numeros').innerHTML = `<div class="marca">Minhas corridas<span>${CIDADE}${EXEMPLO ? ' · dados de exemplo' : ''}</span></div>` + [
  [N, 'corridas'], [`${fmtNum(Math.round(kmTotal))}<small>km</small>`, 'distância'], [`${R.ruas_corridas}<small>ruas</small>`, `de ${fmtNum(R.ruas_total)} na região`],
  [`${fmtPace(paceMedio)}<small>/km</small>`, 'pace médio'], [`${Math.round(media(corridas.filter(c => c.fc).map(c => c.fc)))}<small>bpm</small>`, 'frequência média'],
  [forma.vo2.at(-1)[1], 'VO2max'], [fmtMin(forma.previsoes.at(-1)[1]), 'previsão 5 km'],
].map(([v, r]) => `<div><b>${v}</b><span>${r}</span></div>`).join('');

// ---------- coluna esquerda ----------
// pace das corridas: histograma de 10 em 10 s, com o pace médio marcado
$('pace-titulo').textContent = 'Pace das corridas';
function desenharPace() {
  const svg = $('hist'), lo = 4.9, hi = 7.8, passo = 1 / 6, nb = Math.round((hi - lo) / passo), bins = Array(nb).fill(0);
  for (const c of corridas) bins[Math.min(nb - 1, Math.max(0, Math.floor((c.pace - lo) / passo)))]++;
  const p = plano(svg, [lo, hi], [0, Math.max(...bins) * 1.25], { l: 4, r: 4, t: 16 });
  eixoX(svg, p, [5.5, 6, 6.5, 7, 7.5], fmtPace);
  const larg = (p.W - 8) / nb - 2;
  bins.forEach((n, i) => n && barra(svg, p.px(lo + (i + 0.5) * passo), p.py(0), p.py(n), larg, corPace(lo + (i + 0.5) * passo), `${fmtPace(lo + i * passo)} a ${fmtPace(lo + (i + 1) * passo)}: ${n} corridas`));
  svg.append(el('line', { x1: p.px(paceMedio), x2: p.px(paceMedio), y1: p.M.t - 4, y2: p.py(0), stroke: C.texto, 'stroke-width': 1.5 }));
  rotulo(svg, p.px(paceMedio) + 5, p.M.t + 4, `${fmtPace(paceMedio)} médio`);
}
// descanso e pace: corridas de 4 a 8 km; os 25% mais descansados contra os 25% mais cansados
const comparaveis = todas.filter(c => c.km >= 4 && c.km <= 8 && c.bateria != null);
const [cansado, descansado] = quartis(comparaveis, c => c.bateria);
const pCansado = media(cansado.map(c => c.pace)), pDescansado = media(descansado.map(c => c.pace)), difDescanso = Math.round(pCansado * 60) - Math.round(pDescansado * 60);
$('descanso-titulo').textContent = difDescanso > 0 ? `Descansado, ${difDescanso} s/km mais rápido` : `Cansado, ${-difDescanso} s/km mais rápido`;
$('c-descanso').title = `Corridas de 4 a 8 km. Bateria ao acordar de ${descansado[0].bateria} a 100: ${fmtPace(pDescansado)}/km. De ${cansado[0].bateria} a ${cansado.at(-1).bateria}: ${fmtPace(pCansado)}/km. A diferença é pequena perto da variação entre um dia e outro.`;
function desenharDescanso(aoClicar) {
  const svg = $('dispersao'), p = plano(svg, [0, 100], [7.6, 5.1], { l: 34, r: 14, t: 10, b: 20 });  // mais rápido em cima
  eixoY(svg, p, [7, 6.5, 6, 5.5], fmtPace); eixoX(svg, p, [0, 50, 100]);
  for (const c of comparaveis) ponto(svg, p.px(c.bateria), p.py(Math.min(7.6, Math.max(5.1, c.pace))), corPace(c.pace), `${fmtData(c.data)}: ${fmtNum(c.km, 1)} km a ${fmtPace(c.pace)}/km, bateria ${c.bateria}`, () => aoClicar(c), 2.6);
  for (const [grupo, pm, lado] of [[cansado, pCansado, 'start'], [descansado, pDescansado, 'end']]) {
    const x0 = p.px(grupo[0].bateria), x1 = p.px(grupo.at(-1).bateria);
    svg.append(el('line', { x1: x0, x2: x1, y1: p.py(pm), y2: p.py(pm), stroke: C.texto, 'stroke-width': 2 }));
    rotulo(svg, lado === 'start' ? x0 : x1, p.py(pm) - 6, fmtPace(pm), { ancora: lado });
  }
}

// ---------- coluna direita: extremos e trechos ----------
// o valor de pace aparece na cor do pace (a mesma das barras da linha do tempo)
const paceCor = (p, txt = fmtPace(p)) => `<b style="color:${corPace(p)}">${txt}<small>/km</small></b>`;
const rua5 = corridas.filter(c => c.km >= 5), comBateria = corridas.filter(c => c.bateria != null && c.km >= 4);
// [nome, corrida, explicação no hover]
const EXTREMOS = [
  ['Mais rápida', rua5.reduce((a, b) => b.pace < a.pace ? b : a), 'A de pace mais rápido entre as corridas de 5 km ou mais'],
  ['Mais lenta', rua5.reduce((a, b) => b.pace > a.pace ? b : a), 'A de pace mais lento entre as corridas de 5 km ou mais'],
  ['Mais longa', corridas.reduce((a, b) => b.km > a.km ? b : a), 'A meia maratona'],
  ['Corri mais descansado', comBateria.reduce((a, b) => b.bateria > a.bateria ? b : a), 'A maior bateria corporal ao acordar, entre as corridas de 4 km ou mais'],
  ['Corri mais cansado', comBateria.reduce((a, b) => b.bateria < a.bateria ? b : a), 'A menor bateria corporal ao acordar, entre as corridas de 4 km ou mais'],
].map(([nome, c, dica]) => ({ nome, k: corridas.indexOf(c), dica }));
$('extremos').innerHTML = EXTREMOS.map(({ nome, k, dica }, i) => { const c = corridas[k];
  return `<button data-i="${i}" aria-pressed="false" title="${dica}. Clique de novo para voltar ao dia de hoje."><span>${nome}<small>${fmtData(c.data)}</small></span>${nome === 'Mais longa' ? `<b>${fmtNum(c.km, 1)}<small>km</small></b>` : paceCor(c.pace)}</button>`; }).join('');
const longe = ruas.acesas.filter(a => a.pace && !naZona(a.path[Math.floor(a.path.length / 2)]));
const MINIMO = [10, 6, 3].find(m => longe.filter(a => a.n >= m).length >= 2) ?? 3;  // com poucas corridas, o piso desce
const foraZona = longe.filter(a => a.n >= MINIMO).sort((a, b) => a.pace - b.pace);
const meioDe = a => xy(a.path[Math.floor(a.path.length / 2)]);
// o mais lento a mais de 800 m do mais rápido: os dois extremos às vezes são pedaços vizinhos da mesma rua (subida e descida)
const lento = foraZona.slice().reverse().find(a => Math.hypot(meioDe(a)[0] - meioDe(foraZona[0])[0], meioDe(a)[1] - meioDe(foraZona[0])[1]) > 800);
const TRECHOS = [['Mais rápido', 'Trecho mais rápido', foraZona[0]], ['Mais lento', 'Trecho mais lento', lento]].filter(t => t[2]);
$('c-trechos').hidden = !TRECHOS.length;
$('trechos').innerHTML = TRECHOS.map(([n, , a], i) => `<button data-i="${i}" aria-pressed="false" title="Pace mediano das ${a.n} corridas que passaram por este trecho"><span>${n}</span>${paceCor(a.pace)}</button>`).join('');
$('c-trechos').title = `Trechos de rua por onde passei em ${MINIMO} corridas ou mais, fora do entorno de casa`;

// ---------- mapa ----------
const linha = (path, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: path } });
const L = { 'line-cap': 'round', 'line-join': 'round' };
const VISTA = { center: ORIGEM, zoom: 13.85, pitch: 60, bearing: -18 };
const map = new maplibregl.Map({
  container: 'cena', fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false, maxPitch: 75, ...VISTA,
  style: { version: 8, sources: {
      ofm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      dem: { type: 'raster-dem', tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 13 } },
    layers: [
      { id: 'fundo', type: 'background', paint: { 'background-color': '#0b0915' } },
      { id: 'agua', type: 'fill', source: 'ofm', 'source-layer': 'water', paint: { 'fill-color': '#0b0d26' } },
      { id: 'verde', type: 'fill', source: 'ofm', 'source-layer': 'park', paint: { 'fill-color': '#100d1d' } },
      // as vias acesas fazem as luzes da cidade; nenhum nome entra no mapa (privacidade)
      { id: 'vias-luz', type: 'line', source: 'ofm', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'rail'],
        paint: { 'line-color': '#8f7cf2', 'line-blur': 2.5, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 15, 0.22],
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 2.4, 1], 16, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 12, 5]] } },
      { id: 'vias', type: 'line', source: 'ofm', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'rail'],
        paint: { 'line-color': '#4a3d7d', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 0.9, 0.35], 16, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 6, 2]] } },
      { id: 'luzes', type: 'circle', source: 'ofm', 'source-layer': 'poi',
        paint: { 'circle-color': '#ffd9b0', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 2.2], 'circle-blur': 0.5, 'circle-opacity': 0.7 } },
      { id: 'predios', type: 'fill-extrusion', source: 'ofm', 'source-layer': 'building', minzoom: 12,
        paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#16122a', 30, '#251d42', 90, '#3d2f6e'],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.85 } }],
    terrain: { source: 'dem', exaggeration: 2 } },
});
await new Promise(r => map.once('load', r));
const ESPACO = { left: 320, right: 310, top: 90, bottom: 250 };  // o vão entre os painéis
map.setPadding(ESPACO);
let VISTA_INICIAL;
{ // enquadra as ruas corridas (do 2.º ao 98.º percentil) no vão entre os painéis
  const pts = ruas.acesas.flatMap(a => a.path), lon = pts.map(p => p[0]), lat = pts.map(p => p[1]);
  const cam = map.cameraForBounds([[qs(lon, 0.02), qs(lat, 0.02)], [qs(lon, 0.98), qs(lat, 0.98)]], { bearing: VISTA.bearing, pitch: VISTA.pitch });
  VISTA_INICIAL = { center: cam.center, zoom: cam.zoom + 0.7, bearing: VISTA.bearing, pitch: VISTA.pitch };  // inclinado, sobra fundo: aproxima
  map.jumpTo(VISTA_INICIAL);
}
// ruas corridas: uma cor só, mais clara e mais grossa onde mais corridas passaram (até a corrida da linha do tempo)
const contarAte = (idx, k) => { let lo = 0, hi = idx.length; while (lo < hi) { const m = (lo + hi) >> 1; if (idx[m] <= k) lo = m + 1; else hi = m; } return lo; };
const NMAX = Math.max(...ruas.acesas.map(a => a.n));
const ruasAte = k => ({ type: 'FeatureCollection', features: ruas.acesas.flatMap((a, i) => {
  let n = contarAte(a.cs, k); if (a.z) n = Math.min(n, a.n);  // perto de casa, a intensidade tem teto (ruas.py)
  return n ? [linha(a.path, { i, n, f: Math.log(1 + n) / Math.log(1 + NMAX) })] : [];
}) });
map.addSource('rotas', { type: 'geojson', data: ruasAte(N - 1) });
const COR_RUA = ['interpolate', ['linear'], ['get', 'f'], 0, '#4a2a9e', 0.35, '#7c4dff', 0.7, '#c4b5fd', 1, '#f5f3ff'];
const OPAC = { rotas: ['+', 0.45, ['*', 0.55, ['get', 'f']]], 'rotas-brilho': ['*', 0.5, ['get', 'f']] };
map.addLayer({ id: 'rotas-brilho', type: 'line', source: 'rotas', layout: L, paint: { 'line-color': '#7c4dff', 'line-width': 14, 'line-blur': 10, 'line-opacity': OPAC['rotas-brilho'] } });
map.addLayer({ id: 'rotas', type: 'line', source: 'rotas', layout: L, paint: { 'line-color': COR_RUA, 'line-width': ['+', 1.4, ['*', 3.6, ['get', 'f']]], 'line-opacity': OPAC.rotas } });
function opacidadeRuas(x) { for (const id in OPAC) map.setPaintProperty(id, 'line-opacity', ['*', x, OPAC[id]]); }
function acender(ms = 1400) {  // entrada: as ruas acendem
  const ini = performance.now();
  const passo = now => { const k = Math.min(1, (now - ini) / ms); opacidadeRuas(1 - (1 - k) ** 3); if (k < 1) requestAnimationFrame(passo); };
  requestAnimationFrame(passo);
}
// a corrida escolhida: cada pedaço na cor do pace daquele pedaço, e um ponto que corre por cima
map.addSource('sel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addSource('agora', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addSource('corredor', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addLayer({ id: 'sel-brilho', type: 'line', source: 'sel', layout: L, paint: { 'line-color': ['coalesce', ['get', 'cor'], '#ffffff'], 'line-width': 16, 'line-blur': 10, 'line-opacity': 0.4 } });
map.addLayer({ id: 'sel', type: 'line', source: 'sel', layout: L, paint: { 'line-color': ['coalesce', ['get', 'cor'], '#ffffff'], 'line-width': 4.5 } });
map.addLayer({ id: 'agora', type: 'line', source: 'agora', layout: L, paint: { 'line-color': '#ffffff', 'line-width': 3.2 } });
map.addLayer({ id: 'corredor-halo', type: 'circle', source: 'corredor', paint: { 'circle-radius': 16, 'circle-color': '#ffffff', 'circle-opacity': 0.18, 'circle-blur': 0.6 } });
map.addLayer({ id: 'corredor', type: 'circle', source: 'corredor', paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#120f20', 'circle-stroke-width': 2 } });

// pace em cada ponto da rota, numa janela de ~200 m; parada no meio (relógio pausado ou GPS pulando) fica de fora
function paceLocal(c) {
  const p = c.path.map(xy), d = [0]; for (let i = 1; i < p.length; i++) d.push(d[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return p.map((_, i) => { const a = Math.max(0, i - 8), b = Math.min(p.length - 1, i + 8), m = d[b] - d[a];
    const v = m > 50 ? (c.t[b] - c.t[a]) / 60 / (m / 1000) : null; return v && v > 3.3 && v < 11 ? v : null; });
}
function pedacos(c, pl) {  // a rota em pedaços de 6 pontos, cada um com a cor do pace mediano dele
  const out = [];
  for (let i = 0; i < c.path.length - 1; i += 6) {
    const vs = pl.slice(i, i + 7).filter(Boolean).sort((a, b) => a - b), v = vs[Math.floor(vs.length / 2)];
    out.push(linha(c.path.slice(i, i + 7), { cor: v ? corEm(PACE_TRECHO, v) : '#a19bb5' }));
  }
  return { type: 'FeatureCollection', features: out };
}

// ---------- passar o mouse no mapa: as corridas que passaram ali acendem na linha do tempo; clicar lista todas ----------
const dicaMapa = document.createElement('div'); dicaMapa.className = 'dica-mapa'; document.body.append(dicaMapa);
const passaramAli = i => ruas.acesas[i].cs.filter(k => k <= (kAtual ?? N - 1));
map.on('mousemove', 'rotas', e => {
  if (escolhida?.k != null || document.body.dataset.estado !== 'mapa') return;
  const a = ruas.acesas[e.features[0].properties.i];
  if (a.z) { dicaMapa.style.opacity = 0; acenderNaTempo(null); return; }  // perto de casa: sem contagem nem lista
  const ks = passaramAli(e.features[0].properties.i);
  map.getCanvas().style.cursor = 'pointer';
  dicaMapa.innerHTML = `<b>${ks.length} ${ks.length === 1 ? 'corrida passou' : 'corridas passaram'} aqui</b><span>Clique para escolher uma</span>`;
  Object.assign(dicaMapa.style, { left: `${e.point.x + 16}px`, top: `${e.point.y + 16}px`, opacity: 1 });
  acenderNaTempo(new Set(ks));
});
map.on('mouseleave', 'rotas', () => { map.getCanvas().style.cursor = ''; dicaMapa.style.opacity = 0; acenderNaTempo(null); });
let popup = null;
map.on('click', 'rotas', e => {
  if (escolhida?.k != null) return;
  const i = e.features[0].properties.i; if (ruas.acesas[i].z) return;
  const ks = passaramAli(i).reverse(); dicaMapa.style.opacity = 0;
  popup?.remove();
  // a lista abre para o lado com mais espaço; o mapa fica atrás dos painéis, então ela não pode subir por baixo da faixa de cima
  popup = new maplibregl.Popup({ className: 'lista-mapa', closeButton: false, maxWidth: '280px', offset: 12, anchor: e.point.y < innerHeight * 0.55 ? 'top' : 'bottom' }).setLngLat(e.lngLat)
    .setHTML(`<h3>${ks.length} ${ks.length === 1 ? 'corrida' : 'corridas'} por aqui</h3><div class="lista">${ks.map(k => { const c = corridas[k];
      return `<button data-k="${k}"><span>${fmtData(c.data)}<small>${fmtNum(c.km, 1)} km</small></span>${paceCor(c.pace)}</button>`; }).join('')}</div>`).addTo(map);
  popup.getElement().querySelector('.lista').onclick = ev => { const b = ev.target.closest('button'); if (b) { popup.remove(); escolher(+b.dataset.k, 'Corrida escolhida'); } };
});

// ---------- linha do tempo ----------
const t0 = new Date(corridas[0].data.slice(0, 10)).getTime(), t1 = new Date(corridas.at(-1).data.slice(0, 10)).getTime();
const fracao = c => (new Date(c.data.slice(0, 10)).getTime() - t0) / (t1 - t0);
const tDe = k => (k + 0.99) / N * 0.97;  // o instante da reprodução em que a corrida k terminou de desenhar
const ALT_TRACO = c => 6 + Math.min(1, c.km / 12) * 20;
let LT = null;  // geometria da linha do tempo em pixels: { W, base, x[] }
function desenharTempo() {
  const svg = $('tiques'), W = svg.getBoundingClientRect().width, base = 32;
  svg.setAttribute('viewBox', `0 0 ${W} 50`); svg.replaceChildren();
  LT = { W, base, x: corridas.map(c => 2 + fracao(c) * (W - 4)), rects: [] };
  corridas.forEach((c, i) => { const r = el('rect', { x: LT.x[i] - 1, y: base - ALT_TRACO(c), width: 2, height: ALT_TRACO(c), rx: 1, fill: corPace(c.pace) }); LT.rects.push(r); svg.append(r); });
  LT.seta = el('path', { d: 'M-6,0 L6,0 L0,7 Z', fill: '#fff' }); svg.append(LT.seta);
  const meses = []; for (let d = new Date(corridas[0].data.slice(0, 7) + '-01T12:00'); d.getTime() <= t1; d.setMonth(d.getMonth() + 1)) meses.push(new Date(d));
  $('meses').innerHTML = meses.filter(d => (d - t0) / (t1 - t0) > 0.02).map(d => {
    const m = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return `<span style="left:${(d - t0) / (t1 - t0) * 100}%">${d.getMonth() === 0 ? `${m} ${d.getFullYear()}` : m}</span>`;
  }).join('');
  if (kAtual != null) marcar(kAtual);
}
// lupa: os traços perto do mouse crescem e engrossam; o mais perto fica inteiro, os outros apagam um pouco
function lupa(mx) {
  const R = 70; let perto = 0;
  LT.x.forEach((x, i) => { if (Math.abs(x - mx) < Math.abs(LT.x[perto] - mx)) perto = i; });
  corridas.forEach((c, i) => {
    const d = mx == null ? R : Math.abs(LT.x[i] - mx), g = d < R ? (1 - d / R) ** 2 : 0, h = ALT_TRACO(c) * (1 + 0.7 * g), w = 2 + 3 * g;
    const r = LT.rects[i]; r.setAttribute('x', LT.x[i] - w / 2); r.setAttribute('width', w); r.setAttribute('y', LT.base - h); r.setAttribute('height', h);
    r.setAttribute('opacity', mx == null || i === perto ? 1 : 0.35 + 0.65 * g);
  });
  return perto;
}
const trilha = $('trilha');
let kDica = null;
trilha.addEventListener('mousemove', e => {
  const mx = e.clientX - $('tiques').getBoundingClientRect().left; kDica = lupa(mx);
  const c = corridas[kDica], dica = $('dica-tempo');
  dica.innerHTML = `<b>${fmtData(c.data)}</b><span>${fmtNum(c.km, 1)} km a ${fmtPace(c.pace)}/km</span>`;
  dica.style.left = `${Math.max(90, Math.min(LT.W - 90, LT.x[kDica]))}px`;
});
trilha.addEventListener('mouseleave', () => { lupa(null); kDica = null; });
trilha.addEventListener('mouseenter', () => acenderNaTempo(null));
trilha.addEventListener('click', () => { if (kDica != null) escolher(kDica, `Corrida ${kDica + 1} de ${N}`); });

// corridas que passaram por uma rua do mapa: só elas acesas na linha do tempo
function acenderNaTempo(ks) { LT.rects.forEach((r, i) => r.setAttribute('opacity', !ks || ks.has(i) ? 1 : 0.15)); }

// ---------- ficha da corrida, presa acima da corrida marcada ----------
let kAtual = null, titulo = 'Última corrida';
function marcar(k) {  // seta na linha do tempo e ficha em cima dela; a corrida escolhida ganha o tocador
  const mudou = k !== kAtual || ($('ficha').dataset.titulo !== titulo) || ($('ficha').classList.contains('aberta') !== (escolhida?.k === k));
  kAtual = k;
  const x = LT.x[k]; LT.seta.setAttribute('transform', `translate(${x},${LT.base - ALT_TRACO(corridas[k]) - 10})`);
  const c = corridas[k], f = $('ficha');
  if (mudou) {
    f.dataset.titulo = titulo;
    f.innerHTML = `<div class="linha1"><div class="cab"><b>${titulo}</b><span>${fmtData(c.data)}</span></div>` + [
      [`${fmtNum(c.km, 2)}<small>km</small>`, 'distância'], [`<i style="color:${corPace(c.pace)}">${fmtPace(c.pace)}</i><small>/km</small>`, 'pace'],
      [c.fc ? `${c.fc}<small>bpm</small>` : '–', 'frequência'], [c.bateria ?? '–', 'bateria ao acordar'], [c.sono_h ? `${fmtNum(c.sono_h, 1)}<small>h</small>` : '–', 'sono']]
      .map(([v, r]) => `<div class="m"><b>${v}</b><span>${r}</span></div>`).join('') + '</div>';
    f.classList.toggle('aberta', escolhida?.k === k);
    if (escolhida?.k === k) montarTocador(k);
  }
  const tr = $('tiques').getBoundingClientRect(), w = f.offsetWidth, ax = tr.left + x;
  const left = Math.max(16, Math.min(innerWidth - 16 - w, ax - w / 2));
  f.style.left = `${left}px`; f.style.setProperty('--seta', `${ax - left}px`);
}

// ---------- tocador da corrida escolhida: um ponto corre a rota e o gráfico marca o instante ----------
const DURACAO_CORRIDA = 20;  // segundos de tela para a corrida inteira
let toc = null;  // { k, s (segundo da corrida), tocando, ... }
function montarTocador(k) {
  pararTocador();
  const c = corridas[k], pl = paceLocal(c), T = c.t.at(-1), fc = c.fc_s || [];
  const caixa = document.createElement('div'); caixa.className = 'tocador';
  caixa.innerHTML = `<button class="play pequeno" aria-label="Correr de novo esta corrida"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button><svg class="grafico"></svg>`;
  $('ficha').append(caixa);
  const svg = caixa.querySelector('svg.grafico'), vals = fc.filter(Boolean), lo = Math.floor((Math.min(...vals) - 5) / 10) * 10, hi = Math.ceil((Math.max(...vals) + 5) / 10) * 10;
  const p = plano(svg, [0, T], [lo, hi], { l: 34, r: 8, t: 18, b: 22 });
  eixoY(svg, p, [lo, Math.round((lo + hi) / 20) * 10, hi], v => v, 'bpm');
  const minutos = []; for (let m = 0; m * 60 <= T; m += T > 2400 ? 20 : 10) minutos.push(m * 60);
  eixoX(svg, p, minutos, v => `${v / 60} min`);
  // a linha da frequência, cada pedaço na cor do pace daquele pedaço (a mesma cor do mapa)
  for (let i = 0; i < c.t.length - 1; i += 6) {
    const j = Math.min(c.t.length - 1, i + 6), pts = [];
    for (let q = i; q <= j; q++) if (fc[q]) pts.push(`${p.px(c.t[q])},${p.py(fc[q])}`);
    const vs = pl.slice(i, j + 1).filter(Boolean).sort((a, b) => a - b), v = vs[Math.floor(vs.length / 2)];
    if (pts.length > 1) svg.append(el('polyline', { points: pts.join(' '), fill: 'none', stroke: v ? corEm(PACE_TRECHO, v) : '#a19bb5', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  }
  const cursor = el('line', { y1: p.M.t, y2: p.py(lo), stroke: '#fff', 'stroke-width': 1.5 }), bola = el('circle', { r: 4, fill: '#fff', stroke: C.fundo, 'stroke-width': 2 });
  const rot = el('text', { y: 11, fill: C.texto, 'font-size': 12, 'font-weight': 500, 'text-anchor': 'end', style: 'white-space: pre' });
  svg.append(cursor, bola, rot);
  toc = { k, c, pl, T, fc, p, cursor, bola, rot, s: 0, tocando: false, botao: caixa.querySelector('button') };
  posicionarTocador(0);
  toc.botao.onclick = () => { if (toc.s >= T) toc.s = 0; toc.tocando ? pararTocador() : tocarCorrida(); };
  svg.onclick = e => { const r = svg.getBoundingClientRect(), f = (e.clientX - r.left - p.M.l) / (r.width - p.M.l - p.M.r); posicionarTocador(Math.max(0, Math.min(1, f)) * T); };
}
function posicionarTocador(s) {
  const { c, pl, T, fc, p } = toc; toc.s = s;
  let j = 0; while (j < c.t.length - 2 && c.t[j + 1] <= s) j++;
  const f = Math.max(0, Math.min(1, (s - c.t[j]) / ((c.t[j + 1] - c.t[j]) || 1))), A = c.path[j], B = c.path[j + 1];
  map.getSource('corredor').setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f] } });
  const x = p.px(s), bpm = fc[j] ?? null;
  toc.cursor.setAttribute('x1', x); toc.cursor.setAttribute('x2', x);
  if (bpm) { toc.bola.setAttribute('cx', x); toc.bola.setAttribute('cy', p.py(bpm)); }
  toc.rot.setAttribute('x', p.W - p.M.r);
  toc.rot.textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}   ${bpm ? `${bpm} bpm` : ''}${pl[j] ? `   ${fmtPace(pl[j])}/km` : ''}`;
}
function tocarCorrida() {
  toc.tocando = true; toc.botao.querySelector('path').setAttribute('d', 'M7 5h4v14H7zM13 5h4v14h-4z');
  let antes = performance.now();
  const passo = now => {
    if (!toc?.tocando) return;
    posicionarTocador(Math.min(toc.T, toc.s + (now - antes) / 1000 * toc.T / DURACAO_CORRIDA)); antes = now;
    if (toc.s >= toc.T) return pararTocador();
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
function pararTocador() { if (!toc) return; toc.tocando = false; toc.botao?.querySelector('path').setAttribute('d', 'M8 5v14l11-7z'); }
function fecharTocador() { pararTocador(); toc = null; map.getSource('corredor').setData({ type: 'FeatureCollection', features: [] }); }

// ---------- reprodução: t de 0 a 1, as corridas acendem em ordem; 1 = tudo aceso ----------
let ultimoT = null, kRuas = null;
function desenhar(t) {
  if (t === ultimoT) return; ultimoT = t;
  const corrida = faixa(t, 0, 0.97) * N, fim = t >= 0.97, k = fim ? N - 1 : Math.min(N - 1, Math.floor(corrida));
  const tocando = rel?.tocando;
  map.getSource('agora').setData({ type: 'FeatureCollection', features: tocando && !fim ? [linha(corridas[k].path.slice(0, Math.max(2, Math.floor(corridas[k].path.length * Math.min(1, (corrida - k) / 0.8)))))] : [] });
  if (k !== kRuas) { kRuas = k; map.getSource('rotas').setData(ruasAte(k)) }
  if (tocando) titulo = fim ? 'Última corrida' : `Corrida ${k + 1} de ${N}`;
  marcar(k);
}
const rel = relogio(40, t => { desenhar(t); $('play-icone').setAttribute('d', rel?.tocando ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z'); }, { loop: false });
rel.tocar(false); rel.ir(1);

// ---------- escolher uma corrida: só ela no mapa, em cores de pace, achada na linha do tempo; escolher de novo volta para hoje ----------
let escolhida = null;  // { k, extremo } de corrida, ou { trecho } de trecho
function apagarRuas(on) { opacidadeRuas(on ? 0.08 : 1); }
function apertar() {
  $('extremos').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', escolhida?.k != null && EXTREMOS[b.dataset.i].k === escolhida.k && escolhida.extremo === +b.dataset.i));
  $('trechos').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', escolhida?.trecho === +b.dataset.i));
}
function enquadrar(path) {
  const b = new maplibregl.LngLatBounds(path[0], path[0]); path.forEach(p => b.extend(p));
  const cam = map.cameraForBounds(b, { bearing: VISTA.bearing, pitch: 50 });
  map.flyTo({ center: cam.center, zoom: Math.min(15, cam.zoom), bearing: VISTA.bearing, pitch: 50, duration: 1300 });
}
function limparEscolha() {
  fecharTocador(); popup?.remove();
  map.getSource('sel').setData({ type: 'FeatureCollection', features: [] }); apagarRuas(false);
}
function escolher(k, nome, extremo = null) {
  if (escolhida?.k === k && escolhida.extremo === extremo) return voltarParaHoje();
  if (document.body.dataset.estado === 'analises') estado('mapa');
  limparEscolha(); dicaMapa.style.opacity = 0; acenderNaTempo(null);
  escolhida = { k, extremo }; titulo = nome; apertar();
  rel.tocar(false); rel.ir(tDe(k)); ultimoT = null; desenhar(tDe(k));
  const c = corridas[k]; map.getSource('sel').setData(pedacos(c, paceLocal(c))); apagarRuas(true);
  if (document.body.dataset.estado === 'mapa') enquadrar(c.path);
}
function voltarParaHoje() {
  escolhida = null; titulo = 'Última corrida'; apertar(); limparEscolha();
  rel.tocar(false); rel.ir(1); ultimoT = null; desenhar(1);
  if (document.body.dataset.estado === 'mapa') map.flyTo({ ...VISTA_INICIAL, duration: 1300 });
}
$('extremos').onclick = e => { const b = e.target.closest('button'); if (!b) return; const x = EXTREMOS[+b.dataset.i]; escolher(x.k, x.nome, +b.dataset.i); };
$('trechos').onclick = e => {
  const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.i;
  if (escolhida?.trecho === i) return voltarParaHoje();
  const [, , a] = TRECHOS[i];
  limparEscolha(); escolhida = { trecho: i }; apertar(); titulo = 'Última corrida'; rel.tocar(false); rel.ir(1); ultimoT = null; desenhar(1);
  map.getSource('sel').setData({ type: 'FeatureCollection', features: [linha(a.path, { cor: corEm(PACE_TRECHO, a.pace) })] }); apagarRuas(true);
  map.flyTo({ center: a.path[Math.floor(a.path.length / 2)], zoom: 15.2, pitch: 58, duration: 1300 });
};
$('play').onclick = () => {
  if (!rel.tocando) { if (escolhida) { escolhida = null; apertar(); limparEscolha(); } if (rel.t >= 1) rel.ir(0); }
  rel.tocar();
};
$('hoje').onclick = voltarParaHoje;
const cliqueNaCorrida = c => { const k = corridas.indexOf(c); if (k >= 0) escolher(k, 'Corrida escolhida'); };
desenharPace(); desenharDescanso(cliqueNaCorrida); desenharTempo(); desenhar(1);

// ---------- estados: mapa e todas as análises ----------
let analises = null, vistaMapa = null;
async function estado(nome) {
  const antes = document.body.dataset.estado; if (antes === nome) return;
  if (nome === 'analises') { vistaMapa = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
    map.easeTo({ zoom: vistaMapa.zoom - 0.7, pitch: 32, bearing: vistaMapa.bearing + 8, duration: 1100 }); }
  if (antes === 'analises' && vistaMapa) map.easeTo({ ...vistaMapa, duration: 1100 });
  document.body.dataset.estado = nome;
  if (nome === 'analises' && !analises)  // montada na primeira visita; os cartões entram em cascata (CSS, --i)
    analises = await (await import('./analises.js')).montarAnalises($('analises-grade'), { todas, corPace, aoClicar: cliqueNaCorrida });
}
$('ver-analises').onclick = () => estado('analises');
$('fechar-analises').onclick = () => estado('mapa');
addEventListener('keydown', e => { if (e.key === 'Escape') estado('mapa'); });

// prints: ?estado= abre um estado; ?escolher=i escolhe o extremo i; quadro(t) congela a reprodução
const ESTATICO = params.has('estado') || params.has('estatico') || params.has('escolher');
if (!ESTATICO) { opacidadeRuas(0); document.body.classList.add('entrando'); }
window.quadro = async t => {
  if (!escolhida) rel.quadro(t);
  await new Promise(r => { map.once('idle', r); map.triggerRepaint(); setTimeout(r, 15000); });
};
if (params.get('escolher')) $('extremos').querySelector(`[data-i="${params.get('escolher')}"]`)?.click();
if (params.get('estado')) { await estado(params.get('estado')); }
window.pronto = new Promise(r => map.loaded() ? r() : map.once('idle', r)).then(() => document.fonts.ready).then(() => N);
if (!ESTATICO) window.pronto.then(() => { document.body.classList.remove('entrando'); acender(); });

// redesenha os gráficos e a linha do tempo no tamanho novo quando a janela muda
let espera; addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(() => { desenharPace(); desenharDescanso(cliqueNaCorrida); desenharTempo(); analises?.redesenhar(); }, 150); });
