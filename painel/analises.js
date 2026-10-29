// Estado Análises: oito cartões. O título é a conclusão, numa linha; o gráfico a sustenta; o detalhe fica no hover.
import { BASE, fmtNum, fmtPace, fmtData } from './comum.js';
import { COR, el, plano, eixoY, eixoX, rotulo, ponto, barra, media, quartis } from './graficos.js';

const fmtMin = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const mesCurto = d => new Date(d.slice(0, 7) + '-15T12:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
const correl = p => { const ax = media(p.map(q => q[0])), ay = media(p.map(q => q[1]));
  return p.reduce((s, [x, y]) => s + (x - ax) * (y - ay), 0) / Math.sqrt(p.reduce((s, [x]) => s + (x - ax) ** 2, 0) * p.reduce((s, [, y]) => s + (y - ay) ** 2, 0)); };
const dica = c => `${fmtData(c.data)}: ${fmtNum(c.km, 1)} km a ${fmtPace(c.pace)}/km${c.rua ? '' : ', esteira'}`;

export async function montarAnalises(raiz, { todas, corPace, aoClicar }) {
  const forma = await fetch(BASE + 'forma.json').then(r => r.json());
  const g = todas.filter(c => c.km >= 3);  // corridas curtas demais distorcem médias
  const cartoes = [];
  const novo = () => {
    const sec = document.createElement('section'); sec.className = 'cartao vidro'; sec.style.setProperty('--i', cartoes.length);
    const h2 = document.createElement('h2'), svg = el('svg', { class: 'grafico' });
    sec.append(h2, svg); raiz.append(sec);
    const c = { sec, h2, svg }; cartoes.push(c); return c;
  };
  const conta = (c, titulo, detalhe) => { c.h2.textContent = titulo; c.sec.title = detalhe; };
  const desenhos = [];  // redesenhar no tamanho novo quando a janela muda

  { // 1. calorias por km contra pace
    const c = novo(), pts = g.filter(x => x.kcal), v = x => x.kcal / x.km, [rap, len] = quartis(pts, x => x.pace), m = media(pts.map(v));
    conta(c, `O km custa ${Math.round(m)} kcal, rápido ou devagar`, `Nas 25% mais rápidas, ${Math.round(media(rap.map(v)))} kcal por km; nas 25% mais lentas, ${Math.round(media(len.map(v)))}. Correr rápido gasta mais por minuto (${fmtNum(media(rap.map(x => x.kcal / x.min)), 1)} contra ${fmtNum(media(len.map(x => x.kcal / x.min)), 1)} kcal), não por km.`);
    desenhos.push(() => {
      const p = plano(c.svg, [5.0, 7.6], [60, 100], { l: 38 });
      eixoY(c.svg, p, [60, 80, 100], v => v, 'kcal'); eixoX(c.svg, p, [5.5, 6, 6.5, 7, 7.5], fmtPace);
      pts.forEach(x => ponto(c.svg, p.px(Math.min(7.6, x.pace)), p.py(Math.min(100, Math.max(60, v(x)))), COR.serie, dica(x) + `, ${Math.round(v(x))} kcal/km`, () => aoClicar(x), 2.6));
      c.svg.append(el('line', { x1: p.M.l, x2: p.W - p.M.r, y1: p.py(m), y2: p.py(m), stroke: COR.texto, 'stroke-width': 1.5 }));
    });
  }
  { // 2. passada e cadência
    const c = novo(), pts = g.filter(x => x.cadencia > 130 && x.passada), [rap, len] = quartis(pts, x => x.pace);
    const pr = media(rap.map(x => x.passada)), pl = media(len.map(x => x.passada)), dp = pr / pl - 1, dc = media(rap.map(x => x.cadencia)) / media(len.map(x => x.cadencia)) - 1;
    conta(c, dp > dc ? 'Eu acelero alongando a passada' : 'Eu acelero apressando o passo', `Nas 25% mais rápidas, a passada é ${Math.round(dp * 100)}% mais longa (${fmtNum(pr, 2)} m contra ${fmtNum(pl, 2)} m) e o passo, ${Math.round(dc * 100)}% mais rápido. Cor: pace da corrida.`);
    desenhos.push(() => {
      const p = plano(c.svg, [145, 182], [0.8, 1.3], { l: 38 });
      eixoY(c.svg, p, [0.9, 1.1, 1.3], v => fmtNum(v, 1), 'm'); eixoX(c.svg, p, [150, 160, 170, 180], v => v);
      rotulo(c.svg, p.W - p.M.r, p.H - 18, 'passos/min', { ancora: 'end', cor: COR.eixo, peso: 400, tam: 11 });
      pts.forEach(x => ponto(c.svg, p.px(x.cadencia), p.py(Math.min(1.3, Math.max(0.8, x.passada))), corPace(x.pace), dica(x), () => aoClicar(x), 2.6));
    });
  }
  { // 3. VO2max ao longo do tempo
    const c = novo(), v0 = forma.vo2[0][1], v1 = forma.vo2.at(-1)[1], p0 = forma.previsoes[0], p1 = forma.previsoes.at(-1);
    conta(c, v1 > v0 ? `O VO2max subiu de ${v0} para ${v1}` : v1 < v0 ? `O VO2max caiu de ${v0} para ${v1}` : `O VO2max ficou em ${v1}`, `Estimativa do relógio. A previsão dos 5 km quase não mudou: ${fmtMin(p0[1])} no começo, ${fmtMin(p1[1])} hoje.`);
    desenhos.push(() => {
      const t = d => new Date(d).getTime(), d0 = t(forma.vo2[0][0]), d1 = t(forma.vo2.at(-1)[0]);
      const p = plano(c.svg, [d0, d1], [46, 52], { r: 22 });
      const tri = []; for (let d = new Date(forma.vo2[0][0].slice(0, 7) + '-01T12:00'); d.getTime() <= d1; d.setMonth(d.getMonth() + 3)) if (d.getTime() >= d0) tri.push(d.getTime());
      eixoY(c.svg, p, [46, 48, 50, 52]); eixoX(c.svg, p, tri, v => new Date(v).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''));
      c.svg.append(el('path', { d: forma.vo2.map(([d, v], i) => `${i ? 'L' : 'M'}${p.px(t(d))},${p.py(v)}`).join(''), fill: 'none', stroke: COR.serie, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      ponto(c.svg, p.px(d1), p.py(v1), COR.serie, null, null, 4); rotulo(c.svg, p.px(d1) + 7, p.py(v1) + 4, v1);
    });
  }
  { // 4. batidas do coração por km, mês a mês
    const c = novo(), por = {}; g.filter(x => x.fc && x.km >= 4 && x.km <= 8).forEach(x => (por[x.data.slice(0, 7)] ??= []).push(x.fc * x.pace));
    const meses = Object.keys(por).sort(), vals = meses.map(m => media(por[m])), a = media(vals.slice(0, 3)), b = media(vals.slice(-3));
    conta(c, b < a ? 'O coração ficou mais econômico' : 'O coração não ficou mais econômico', `Batidas por km: frequência média vezes o pace, nas corridas de 4 a 8 km. Três primeiros meses: ${Math.round(a)}; três últimos: ${Math.round(b)}.`);
    desenhos.push(() => {
      const lo = 800, hi = 1050, p = plano(c.svg, [-0.5, meses.length - 0.5], [lo, hi], { l: 40 });
      eixoY(c.svg, p, [800, 900, 1000], v => fmtNum(v), 'batidas'); eixoX(c.svg, p, meses.map((_, i) => i).filter(i => i % 3 === 0), i => mesCurto(meses[i]));
      const larg = Math.min(16, (p.W - p.M.l - p.M.r) / meses.length - 4);
      vals.forEach((v, i) => barra(c.svg, p.px(i), p.py(lo), p.py(v), larg, COR.serie, `${mesCurto(meses[i])}: ${Math.round(v)} batidas por km`));
    });
  }
  { // 5. esforço percebido e frequência cardíaca
    const c = novo(), pts = g.filter(x => x.rpe && x.fc), r = correl(pts.map(x => [x.rpe, x.fc]));
    conta(c, Math.abs(r) > 0.4 ? 'A nota que dou acompanha o coração' : 'A nota que dou pouco tem a ver com o coração', `Esforço percebido (a nota depois da corrida) contra a frequência média. Correlação ${fmtNum(r, 2)}. A linha é a média de cada nota.`);
    desenhos.push(() => {
      const p = plano(c.svg, [0.5, 10.5], [120, 175], { l: 38 });
      eixoY(c.svg, p, [130, 150, 170], v => v, 'bpm'); eixoX(c.svg, p, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      pts.forEach((x, i) => ponto(c.svg, p.px(x.rpe) + ((i * 37) % 11 - 5), p.py(Math.min(175, Math.max(120, x.fc))), COR.serie, dica(x) + `, nota ${x.rpe}`, () => aoClicar(x), 2.2));
      const notas = [...new Set(pts.map(x => x.rpe))].sort((a, b) => a - b).filter(n => pts.filter(x => x.rpe === n).length >= 5);
      c.svg.append(el('path', { d: notas.map((n, i) => `${i ? 'L' : 'M'}${p.px(n)},${p.py(media(pts.filter(x => x.rpe === n).map(x => x.fc)))}`).join(''), fill: 'none', stroke: COR.texto, 'stroke-width': 2 }));
    });
  }
  { // 6. dias da semana
    const c = novo(), dias = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
    const cont = dias.map((_, i) => todas.filter(x => (new Date(x.data.slice(0, 10) + 'T12:00').getDay() + 6) % 7 === i).length);
    const top = cont.map((n, i) => [n, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(x => x[1]);
    const plural = d => d + 's';
    conta(c, `Corro mais às ${plural(dias[top[0]])}, ${plural(dias[top[1]])} e ${plural(dias[top[2]])}`, `Corridas por dia da semana, rua e esteira, de ${fmtData(todas[0].data)} a ${fmtData(todas.at(-1).data)}.`);
    desenhos.push(() => {
      const p = plano(c.svg, [0, Math.max(...cont) * 1.15], [7, 0], { l: 64, b: 4, r: 28 });
      const alt = (p.H - p.M.t - p.M.b) / 7;
      dias.forEach((d, i) => {
        const y = p.M.t + alt * (i + 0.5);
        rotulo(c.svg, p.M.l - 8, y + 4, d, { ancora: 'end', cor: COR.texto2, peso: 400, tam: 12 });
        const x1 = p.px(cont[i]), h = Math.min(14, alt - 6), r = Math.min(3, h / 2);
        c.svg.append(el('path', { d: `M${p.M.l},${y - h / 2} H${x1 - r} Q${x1},${y - h / 2} ${x1},${y - h / 2 + r} V${y + h / 2 - r} Q${x1},${y + h / 2} ${x1 - r},${y + h / 2} H${p.M.l} Z`, fill: top.includes(i) ? COR.serie : 'rgba(167,139,250,.32)' }));
        rotulo(c.svg, x1 + 6, y + 4, cont[i], { cor: COR.texto2, peso: 400, tam: 11 });
      });
    });
  }
  { // 7. rua e esteira
    const c = novo(), grupos = [['Rua', g.filter(x => x.rua)], ['Esteira', g.filter(x => !x.rua)]];
    const [mr, me] = grupos.map(([, l]) => media(l.map(x => x.pace))), dif = Math.abs(Math.round(me * 60) - Math.round(mr * 60));
    const [fr, fe] = grupos.map(([, l]) => media(l.filter(x => x.fc).map(x => x.fc)));
    conta(c, mr < me ? `Na rua, ${dif} s/km mais rápido` : `Na esteira, ${dif} s/km mais rápido`, `Rua: ${fmtPace(mr)}/km com ${Math.round(fr)} bpm, ${grupos[0][1].length} corridas. Esteira: ${fmtPace(me)}/km com ${Math.round(fe)} bpm, ${grupos[1][1].length} corridas.`);
    desenhos.push(() => {
      const p = plano(c.svg, [5.0, 7.6], [0, 1], { l: 64 });
      eixoX(c.svg, p, [5.5, 6, 6.5, 7, 7.5], fmtPace);
      const faixa = (p.H - p.M.t - p.M.b) / 2;
      grupos.forEach(([nome, lista], j) => {
        const y = p.M.t + faixa * (j + 0.5), m = j ? me : mr;
        rotulo(c.svg, p.M.l - 10, y + 4, nome, { ancora: 'end', cor: COR.texto2, peso: 400, tam: 12 });
        lista.forEach((x, i) => ponto(c.svg, p.px(Math.min(7.6, x.pace)), y + ((i * 29) % 23 - 11) * Math.min(1, faixa / 60), corPace(x.pace), dica(x), () => aoClicar(x), 2.2));
        c.svg.append(el('line', { x1: p.px(m), x2: p.px(m), y1: y - faixa * 0.38, y2: y + faixa * 0.38, stroke: COR.texto, 'stroke-width': 2 }));
        rotulo(c.svg, p.px(m) + 5, y - faixa * 0.3, fmtPace(m), { tam: 12 });
      });
    });
  }
  { // 8. bateria corporal gasta
    const c = novo(), pts = g.filter(x => x.bateria_gasta != null && x.bateria_gasta >= 0);
    const k = pts.reduce((s, x) => s + x.bateria_gasta * x.km, 0) / pts.reduce((s, x) => s + x.km * x.km, 0);  // reta pela origem
    conta(c, `Cada km gasta ${fmtNum(k, 1)} pontos de bateria`, `Bateria corporal que cada corrida gastou, contra a distância. A linha é a reta que melhor passa pelos pontos, saindo do zero.`);
    desenhos.push(() => {
      const p = plano(c.svg, [0, 22], [0, 40], { l: 44 });
      eixoY(c.svg, p, [0, 20, 40], v => v, 'pontos'); eixoX(c.svg, p, [5, 10, 15, 20], v => `${v} km`);
      pts.forEach(x => ponto(c.svg, p.px(Math.min(22, x.km)), p.py(Math.min(40, x.bateria_gasta)), COR.serie, dica(x) + `, ${x.bateria_gasta} pontos`, () => aoClicar(x), 2.6));
      c.svg.append(el('line', { x1: p.px(0), y1: p.py(0), x2: p.px(22), y2: p.py(Math.min(40, 22 * k)), stroke: COR.texto, 'stroke-width': 1.5 }));
    });
  }
  const redesenhar = () => desenhos.forEach(d => d());
  redesenhar();
  return { cartoes: cartoes.map(c => c.sec), redesenhar };
}
