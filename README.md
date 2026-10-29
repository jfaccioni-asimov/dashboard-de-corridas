# Dashboard de corridas

Um painel das suas corridas do Garmin: o mapa 3D com as ruas que você correu (mais claras onde passou mais vezes), a linha do tempo de todas as corridas, a rota de cada uma com o pace trecho a trecho e oito análises (pace contra descanso, VO2max, frequência cardíaca, sono, bateria corporal…).

Roda no seu computador, sem conta e sem servidor: você pede a exportação dos seus dados ao Garmin, coloca o zip numa pasta e roda um comando.

O repositório já vem com **50 corridas simuladas** em Porto Alegre (nenhuma é de uma pessoa real), então dá para abrir o painel antes de importar qualquer coisa.

## Rodando

Precisa do [uv](https://docs.astral.sh/uv/) (instala o Python e as dependências sozinho) e de internet (o mapa e as ruas vêm do OpenStreetMap).

```bash
git clone <url deste repositório>
cd dashboard-de-corridas
uv run rodar.py
```

O comando abre o painel em http://127.0.0.1:8765/painel/. Enquanto você não importar seus dados, ele mostra o exemplo (aparece "dados de exemplo" no canto de cima). Ctrl+C encerra.

## Com os seus dados

1. Peça a exportação em [garmin.com/account/datamanagement](https://www.garmin.com/account/datamanagement/) → **Exportar seus dados**. O Garmin manda um link por e-mail; em geral chega em minutos, às vezes em horas ou dias.
2. Coloque o zip, do jeito que veio, na pasta **`importar/`**.
3. Rode `uv run rodar.py` de novo.

Ele reconhece o zip novo e faz tudo: extrai, organiza as atividades, gera as rotas e baixa do OpenStreetMap as ruas da região onde você corre (na primeira vez demora uns minutos, e a Overpass, que é gratuita, às vezes pede para tentar de novo; o script já tenta sozinho). Depois abre o painel com as suas corridas. Para atualizar, coloque o zip novo em `importar/`.

O que vai para a pasta `dados/` (que o git ignora, então nada seu sobe sem querer): o zip extraído, as atividades e os arquivos que o painel lê.

O painel foi feito para relógios Garmin que registram VO2max, sono e bateria corporal. Sem esses dados alguns gráficos ficam vazios ou o painel pode falhar; se acontecer, abra uma issue com a mensagem de erro do console do navegador.

### Privacidade

A rota de GPS mostra onde você mora. Por isso:

- os primeiros e os últimos 400 m de cada corrida são cortados antes de qualquer coisa ser salva;
- em volta de casa (2,2 km, com o centro deslocado ao acaso) o painel limita a intensidade: as ruas não ficam mais brilhantes só porque todas as corridas saem dali;
- nenhum nome de rua aparece no mapa.

Mesmo assim, antes de postar um print ou um vídeo, olhe o que está na tela.

## Como funciona

```
importar/            o zip do Garmin
scripts/extrair.py   extrai o zip e separa as atividades (um FIT por corrida) em dados/
scripts/processar.py lê os FIT e gera dados/corridas.json (rota, pace, frequência, sono…) e forma.json
scripts/ruas.py      cruza as rotas com as ruas do OpenStreetMap e gera dados/ruas.json
painel/              a página (HTML, CSS e JavaScript puro, sem build; MapLibre pelo CDN)
exemplo/             as corridas simuladas, no mesmo formato de dados/
scripts/simular.py   gera o exemplo/ (semente fixa); só precisa rodar se quiser refazê-lo
```

Dá para rodar cada etapa separada, `uv run scripts/ruas.py` por exemplo. Uma rua conta como corrida quando você passou a menos de 18 m dela, na mesma direção, e uma rua inteira conta com pelo menos 200 m corridos.

## Fontes

- Mapa: [OpenFreeMap](https://openfreemap.org/) e [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL); relevo: Mapzen/AWS Terrain Tiles.
- Ruas: OpenStreetMap, pela [Overpass API](https://overpass-api.de/).
