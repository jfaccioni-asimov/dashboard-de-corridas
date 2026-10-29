// Peças dos gráficos do painel, em SVG no tamanho real do cartão (texto sempre em px de verdade, nunca escalado).
// Regras da skill dataviz: grade e eixo em fio recessivo, um eixo y por gráfico, texto nunca na cor do dado,
// rótulo direto só no que importa, ponto com anel da cor do fundo.
export const COR = { grade: 'rgba(255,255,255,.07)', eixo: '#a19bb5', texto: '#f4f2fa', texto2: '#b9b4c9', serie: '#a78bfa', fundo: '#120f20' };
const NS = 'http://www.w3.org/2000/svg';
export const el = (tag, at, txt) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (txt != null) e.textContent = txt; return e; };

// prepara o svg no tamanho em que ele aparece e devolve as escalas
export function plano(svg, X, Y, m = {}) {
  const r = svg.getBoundingClientRect(), W = Math.max(160, r.width), H = Math.max(80, r.height);
  const M = { l: 34, r: 8, t: 22, b: 22, ...m };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const px = v => M.l + (v - X[0]) / (X[1] - X[0]) * (W - M.l - M.r);
  const py = v => H - M.b - (v - Y[0]) / (Y[1] - Y[0]) * (H - M.t - M.b);
  return { W, H, M, px, py };
}
// fios horizontais com o valor à esquerda; a unidade fica acima do eixo, uma vez só
export function eixoY(svg, p, tiques, fmt = v => v, unidade = '') {
  for (const v of tiques) {
    svg.append(el('line', { x1: p.M.l, x2: p.W - p.M.r, y1: p.py(v), y2: p.py(v), stroke: COR.grade }));
    svg.append(el('text', { x: p.M.l - 6, y: p.py(v) + 4, 'text-anchor': 'end', fill: COR.eixo, 'font-size': 11 }, fmt(v)));
  }
  if (unidade) svg.append(el('text', { x: 0, y: 9, fill: COR.eixo, 'font-size': 11 }, unidade));
}
export function eixoX(svg, p, tiques, fmt = v => v) {
  for (const v of tiques) svg.append(el('text', { x: p.px(v), y: p.H - 5, 'text-anchor': 'middle', fill: COR.eixo, 'font-size': 11 }, fmt(v)));
}
// rótulo com halo da cor do fundo: continua legível em cima dos pontos
export function rotulo(svg, x, y, txt, { ancora = 'start', cor = COR.texto, peso = 500, tam = 12 } = {}) {
  svg.append(el('text', { x, y, 'text-anchor': ancora, fill: cor, 'font-size': tam, 'font-weight': peso, stroke: COR.fundo, 'stroke-width': 3, 'stroke-linejoin': 'round', 'paint-order': 'stroke' }, txt));
}
export function ponto(svg, x, y, cor, titulo, aoClicar, r = 3) {
  const d = el('circle', { cx: x, cy: y, r, fill: cor, stroke: COR.fundo, 'stroke-width': 1, class: aoClicar ? 'clicavel' : '' });
  if (titulo) d.append(el('title', {}, titulo));
  if (aoClicar) { d.style.cursor = 'pointer'; d.addEventListener('click', aoClicar); }
  svg.append(d);
}
// barra fina, arredondada só na ponta de dado
export function barra(svg, x, y0, y1, larg, cor, titulo) {
  const h = Math.max(1, y0 - y1), r = Math.min(3, larg / 2, h);
  const b = el('path', { d: `M${x - larg / 2},${y0} V${y1 + r} Q${x - larg / 2},${y1} ${x - larg / 2 + r},${y1} H${x + larg / 2 - r} Q${x + larg / 2},${y1} ${x + larg / 2},${y1 + r} V${y0} Z`, fill: cor });
  if (titulo) b.append(el('title', {}, titulo));
  svg.append(b);
}
export const media = a => a.reduce((s, x) => s + x, 0) / a.length;
export const quartis = (lista, chave) => { const o = lista.slice().sort((a, b) => chave(a) - chave(b)), q = Math.floor(o.length / 4); return [o.slice(0, q), o.slice(-q)]; };
