// O que o painel divide: dados, projeção e formatos.

export const params = new URLSearchParams(location.search);

// dados/ é o que o rodar.py gerou da exportação do Garmin; sem ele, o painel mostra exemplo/ (corridas simuladas)
export const EXEMPLO = !(await fetch(new URL('../dados/corridas.json', import.meta.url), { method: 'HEAD' })).ok;
export const BASE = new URL(EXEMPLO ? '../exemplo/' : '../dados/', import.meta.url).href;
const ruasJson = await fetch(BASE + 'ruas.json').then(r => r.json());
export const CIDADE = ruasJson.resumo.cidade;

export async function carregar() {
  const ruas = ruasJson;
  const todas = await fetch(BASE + 'corridas.json').then(r => r.json());
  const corridas = todas.filter(c => c.rua && c.local === CIDADE).sort((a, b) => a.data.localeCompare(b.data));
  const desfaz = p => { const out = []; let x = 0, y = 0; for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; out.push([x / 1e5, y / 1e5]); } return out; };
  ruas.base = ruas.base.map(v => ({ c: ruas.classes[v[0]], path: desfaz(v.slice(1)) }));
  ruas.acesas.forEach(a => { a.path = desfaz(a.p); delete a.p; a.c = ruas.classes[a.c]; });
  // zona privada (privacidade.json, do processar.py): perto de casa a intensidade fica limitada
  const zona = await fetch(BASE + 'privacidade.json').then(r => r.ok ? r.json() : null).catch(() => null);
  return { todas, corridas, ruas, zona };
}

// metros a partir do centro das corridas (eixo y para o norte)
export const ORIGEM = ruasJson.resumo.origem;
export const KX = Math.cos(ORIGEM[1] * Math.PI / 180) * 111320, KY = 110540;
export const xy = ([lon, lat]) => [(lon - ORIGEM[0]) * KX, (lat - ORIGEM[1]) * KY];
export const lonlat = ([x, y]) => [x / KX + ORIGEM[0], y / KY + ORIGEM[1]];

export const fmtPace = p => { let m = Math.floor(p), s = Math.round((p - m) * 60); if (s === 60) { m++; s = 0; } return `${m}:${String(s).padStart(2, '0')}`; };
export const fmtNum = (n, d = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtData = d => new Date(d.replace(' ', 'T')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ de /g, ' ').replace('.', '');
export const suave = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
export const faixa = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

// relógio da animação: toca sozinho na página; quadro(t) congela num instante para o print ou a gravação
export function relogio(duracao, desenhar, { loop = true } = {}) {
  let t = 0, ultimo = performance.now(), tocando = true, gravando = false;
  const passo = now => {
    if (!gravando) {
      if (tocando) { t += (now - ultimo) / 1000 / duracao; if (t > 1) t = loop ? 0 : 1; }
      desenhar(t);
    }
    ultimo = now;
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
  return {
    get t() { return t; },
    get tocando() { return tocando; },
    quadro(x) { gravando = true; t = x; return desenhar(x); },
    tocar(v = !tocando) { tocando = v; return v; },
    ir(x) { t = x; },
  };
}
