# Apex Dynasty v0.10.0 — Cenários e revalidação do movimento

**BUILD THE TEAM. MASTER THE RACE.**  
15/10/2026 • Continuação da v0.9.0, sem substituição do jogo.

## Resultado e limites

**Classificação global: Implementado parcialmente.** Há implementação executável de composição ambiental nos 14 circuitos e correções reproduzidas de apresentação. Isso não certifica como concluídos todos os itens dos dois prompts extensos. A arquitetura de movimento v0.9 foi preservada e submetida novamente a regressões, não anunciada como uma nova implementação.

O relatório consolida validação de fonte/build e capturas atuais; a suíte completa em Chromium no build de produção está em execução. Itens ainda abertos permanecem marcados como parciais ou pendentes.

## 1. Auditoria, causas e escopo

A investigação anterior às alterações está em `AUDITORIA-CENARIOS-v010.md`. Sem diretório Git, foram comparados 285 hashes do manifesto: todos iguais antes da edição. O ZIP v0.9 permaneceu protegido, SHA256 `d373b2727cfe5ef14707cb21fcbc912b85053a913d450169683103e56c1f529c`. A referência foi extraída apenas em cache para comparação. Documentos históricos já existentes, mas omitidos daquele ZIP, foram preservados; não são documentos novos desta revisão.

### Confirmado e corrigido
- **Alto — visão aérea:** câmera de corrida permanecia com `far=1440` em Medium, também usado como fim da névoa. O enquadramento de Aurora já ficava a aproximadamente 1260 m do alvo. Alcance e névoa agora dependem da altura, distância ao alvo e extensão do ambiente. O plano próximo volta a 0,2 m nas câmeras baixas e chega a 20 m nas aéreas. Não há alteração da posição física dos carros.
- **Alto — composição vazia:** terreno plano quase monocromático, vegetação limitada a um anel exterior de 130 instâncias e horizonte de 22 cones isolados. Foram substituídos por agrupamentos determinísticos, instalações auxiliares e uma malha contínua de relevo distante. Pista, traçado, barreiras físicas, largura, entradas de pit e suporte das rodas mantêm suas coordenadas.
- **Médio — faixas claras sobre o asfalto:** diagnóstico por camadas mostrou que ocultar a superfície de acostamento eliminava as faixas. Alterar apenas near e desligar sombras não as eliminava. O acostamento ocupava toda a largura sob o asfalto; agora são duas faixas laterais expostas, nas mesmas alturas e limites externos. Não se aplicou um deslocamento artificial à pista nem se desativaram sombras. Isso não prova que todo artefato histórico de profundidade tenha a mesma causa.
- **Médio — apoio da vegetação:** troncos anteriores usavam centro Y fixo com escala variável, deixando algumas bases suspensas. Novas geometrias têm origem na base; rochas penetram levemente no terreno.
- **Médio — materiais redundantes:** quatro mensagens publicitárias eram recriadas em até 19 texturas/materiais. Agora os quatro conjuntos são compartilhados. Painéis mantêm posições/mensagens e recebem dois apoios.
- **Correções na própria validação:** primeira versão do relevo mostrou uma emenda circular; faixa inicial plana e mesma função de cor do solo corrigem a transição. A altura das bases dos novos pátios foi corrigida para ficar acima, não abaixo, do gramado.

### Não confirmado / preservado
Não foi identificado novo defeito que justificasse mudar a física, colisão, IA, direção, interpolação ou animação das rodas. Arquibancadas, público, garagens, equipe de pit, torre, placares e infraestrutura já existiam. Não foram reconstruídos nem removidos para simular ganho de desempenho.

## 2. Implementação por circuito

Os números contam vegetação **ou rochas**, conforme o bioma, e núcleos auxiliares (cada núcleo contém mais de uma peça/construção). Não são novos espectadores nem veículos de corrida. Perfis diferem em forma, altura, densidade, relevo e paleta; compartilham peças leves. Não há alegação de reprodução de circuitos reais.

| Circuito | Vegetação/rochas | Núcleos | Composição implementada |
|---|---:|---:|---|
| Aurora | 639 | 26 | Árvores de copa larga, pequenos conjuntos com telhados, colinas arborizadas. |
| Veloce | 551 | 26 | Coníferas, colinas médias, coberturas em tons terrosos. |
| Serpente | 389 | 25 | Rochas de arenito, instalações claras e relevo desértico. |
| Neon | 368 | 26 | Vegetação urbana, fachadas/faixas de janelas e volumes auxiliares mais altos. |
| Titan | 421 | 26 | Rochas maiores, instalações de paleta industrial e relevo árido. |
| Vento | 575 | 24 | Agrupamentos costeiros, paleta clara/azulada; plano de água existente preservado. |
| Sahara | 336 | 26 | Rochas baixas mais espaçadas e relevo suave; espaços abertos intencionais. |
| Alpine | 720 | 26 | Coníferas altas e maior amplitude do relevo distante. |
| Emerald | 652 | 26 | Copas maiores e agrupamentos verdes densos com clareiras de segurança. |
| Oldtown | 493 | 26 | Prédios existentes mais baixos, telhados terrosos e fachadas complementadas. |
| Sunset | 653 | 25 | Vegetação costeira e coberturas quentes; iluminação de pôr do sol existente. |
| Nordic | 714 | 26 | Coníferas claras, paleta de inverno e relevo nevado. |
| Desert-night | 473 | 26 | Rochas cinza, relevo alto e estruturas de paleta noturna. |
| Discovery | 726 | 26 | Coníferas e núcleos de apoio ao traçado procedural existente. |

A geração rejeita volumes próximos à estrada, boxes, instalações físicas, prédios urbanos existentes e arquibancadas. Os 15 testes novos verificam determinismo, margens conservadoras, apoio no terreno plano, normal do relevo e preservação da população entre níveis de detalhe. A validação não é uma certificação de todos os cruzamentos de linhas de visão possíveis.

## 3. Cenário, pits, câmeras, luz e clima

- **Solo/pista:** variação suave de cor por vértice; textura local `asphalt-worn` já existente e filtragem linear para superfícies. Desgaste é **estático**, não marcas produzidas pelos carros da sessão. Alturas da pista/kerbs/pit não foram modificadas. Não foi criado um sistema novo de marcas dinâmicas.
- **Público:** preservados dez conjuntos de arquibancadas por circuito e 3760–6464 espectadores, conforme o circuito. Instâncias/atlas/variações, eventos de torcida e placares reais já pertenciam à v0.9. Não houve criação de público individual pesado nem troca por imagens de arquibancadas vazias. A animação GPU preexistente continua; não se afirma conversão completa em público exclusivamente estático.
- **Boxes:** serviços, filas, equipe, elevação, rodas e mesclagem física mantidos. Novos núcleos são infraestrutura externa; não são novos boxes funcionais nem interiores detalhados.
- **Câmeras:** alcance/névoa corrigidos sem usar a câmera como entrada de física. Regressões incluem retorno de overview para cockpit e modos de pit, nos três presets. Cobertura visual detalhada adiante.
- **Luz/sombras:** mesma arquitetura de luz direcional, preenchimento e sombras da pose atual. Vegetação/instalações são casters/receivers reais; nenhum novo conjunto de luzes dinâmicas foi adicionado.
- **Clima:** preservado o estado real em `events/Weather.js` e sua influência gradual existente. Efeitos de chuva e comportamento molhado não foram reconstruídos. Uma expansão visual meteorológica além do existente continua pendente; não foi inventado grip para decoração.

## 4. Otimização e medições

Geometrias de vegetação são compartilhadas; instâncias agrupadas em células de 320 m preservam culling espacial. LOD com histerese troca complexidade, não quantidade de plantas. Matrizes/cores das instâncias são compartilhadas entre representações. Construção acontece uma vez por circuito. Não há novo RAF, timer, sistema de física, áudio ou dependência. World continua responsável pelo descarte dos recursos, inclusive representações ocultas de LOD. A superfície distante tem 1728 triângulos.

O custo maior de enxergar conteúdo antes cortado não deve ser confundido com regressão de simulação. Mais cenário também pode aumentar o custo gráfico; não há promessa de ganho geral de FPS.

Medição pareada concluída, v0.9 protegida (`start.py`, porta 5200) seguida pelo build v0.10 de produção (`start.py`, porta 5201), no mesmo sandbox e Chromium/SwiftShader. Mesmos quatro cenários: Aurora/Neon, sombras 1024/0; 1280×720, seis carros, chuva, Custom equivalente a High, áudio excluído, 20 frames de aquecimento + 80 medidos, seis ticks fixos por frame. Arquivos completos: `tests/performance/v081/paired-before-browser.json` e `paired-after-browser.json`.

| Circuito/sombras | Intervalo de frame médio antes → depois (ms) | P95 antes → depois | Simulação (6 ticks) média antes → depois (ms) | Submissão de render média antes → depois (ms) | Draw calls antes → depois | Triângulos antes → depois |
|---|---:|---:|---:|---:|---:|---:|
| Aurora / 1024 | 448,59 → 675,93 | 583,4 → 886,7 | 1,565 → 1,822 | 3,35 → 4,07 | 135 → 148 | 95.264 → 128.532 |
| Aurora / off | 399,45 → 577,01 | 555,2 → 738,9 | 1,600 → 1,511 | 2,36 → 2,69 | 85 → 92 | 80.912 → 101.360 |
| Neon / 1024 | 500,22 → 617,55 | 591,0 → 743,1 | 1,803 → 1,813 | 3,61 → 3,52 | 144 → 155 | 100.910 → 128.958 |
| Neon / off | 356,92 → 526,86 | 520,1 → 674,0 | 1,790 → 1,837 | 2,60 → 2,62 | 92 → 97 | 86.090 → 106.086 |

**Leitura honesta:** neste SwiftShader/sandbox, intervalos médios medidos ficaram 23,5–50,7% maiores depois do cenário em três pares; a submissão de render variou −2,3% a +21,5%, enquanto o trecho de seis ticks ficou entre −5,5% e +16,5% (medianas/p95 e amostras completas nos JSON). Aumento de triângulos/draw calls é real, esperado por tornar o ambiente mais visível; não se reivindica melhora de FPS. Esses frames de centenas de ms estão muito abaixo do alvo de 60 Hz e não representam hardware gráfico nativo; os resultados mostram sobretudo custo/desempenho relativo sob renderização por software. Não reduziram bots, qualidade ou sombras para fabricar ganho. `renderer.info.memory` permaneceu da mesma ordem (123–129 geometrias, 19–27 texturas); heap relatado oscilou 13,4–21,7 MB, sem perfil de memória nativa. Intervalos de frame incluem limitação/overhead do navegador e não são tempo de GPU isolado.

## 5. Validação e cobertura real

- `npm test`: **189/189 aprovados** após a correção final de preview/relevo; `tests/performance/environment/node-tests-final.txt`. `npm run assets:validate`: concluído; `assets-final.txt`.
- `COMPARISON_OUTPUT=tests/performance/environment/authoritative-comparison.json node scripts/compare-motion-simulation.js ...`: **14 corridas manager completas, três voltas, igualdade exata** de estados, decisões, eventos e resultados (48,545 s).
- Build de produção aprovado, 85 módulos; JS 941,82 kB / gzip 270,78 kB. Aviso não fatal de chunk >500 kB permanece. `npm run build:playable` atualizou a distribuição executável `playable/`.
- `GAME_URL=http://localhost:5201 node scripts/inspect-environment.js final`: 56 capturas atuais, 14 circuitos × overview/broadcast/chase/pit-garage; seis carros, 600 ticks; zero erros de console. Todas as 14 folhas de quatro câmeras foram examinadas após a correção da emenda do relevo e das alturas dos pátios. As imagens estão em `tests/performance/environment/final/` e folhas `review-final-*.jpg`.
- ZIP extraído independentemente: `npm ci`, build, **189/189 Node (141,031 ms)**, assets/15 GLBs aprovados; 138 arquivos `dist` byte-idênticos ao build principal; smoke browser extraído **2/2** (ambiente 14×3×4 + estabilidade/startup) passou em 4,1 min. Evidências `release-extracted-{install,build,node,assets,browser}.txt`.
- Suíte Playwright completa contra o build de produção local, `GAME_URL=http://localhost:5201 npm run test:browser`: **38/38 aprovados em 26,1 min**, `tests/performance/environment/browser-tests-release.txt`. Abrange ambiente nos 14 circuitos×3 níveis×4 câmeras, simulação/movimento, sombras, pits, recursos, startup, carreira, manager, resultados e áudio. A execução exploratória no Vite não conta como falha do release: estabilidade exige HTML de produção; o teste de câmera preview levou à correção de manter far=6000 nessa tela. A execução final de produção após a correção foi toda aprovada.

Câmeras da inspeção de todos os circuitos: **overview, broadcast, chase e pit-garage**. As regressões de movimento cobrem os 12 modos existentes, mas isso não equivale a inspeção visual de 12×14 sequências temporais. Não houve avaliação humana de condução contínua em GPU nativa, áudio subjetivo ou campanha visual dedicada de ultrapassagens por dentro/fora.

## 6. Checklist de cenários

| Área | Estado nesta entrega | Limite |
|---|---|---|
| Composição em camadas / 14 circuitos | Implementado, mas não validado integralmente | Capturas atuais overview/broadcast/chase/pit-garage e matriz de produção 14×3×4; arquitetura/identidade ainda parcial. |
| Identidade por circuito | Parcial | Perfis próprios e agrupamentos, mas módulos arquitetônicos ainda compartilhados. |
| Público / arquibancadas | Parcial | Sistema denso existente preservado; não foi redesenhado ou expandido. |
| Vegetação / rochas / apoio | Concluído e validado nos testes geométricos | Sem garantia para todos os pontos de câmera; estilo low-poly. |
| Relevo / horizonte | Parcial | Relevo 3D contínuo e recapturado; ainda há biomas com morros baixos/estilizados e litoral Vento com borda geométrica visível. |
| Asfalto / acostamento | Concluído e validado nas capturas | Textura/desgaste estáticos; detalhe avançado e escapadas especializadas não implementados. |
| Arquitetura / apoio | Parcial | Pátios, construções e estacionamento estilizados; rede completa de acessos não implementada. |
| Publicidade / apoios | Concluído e validado no build/capturas | Mensagens existentes reutilizadas; não redesenho total de sinalização. |
| Pits funcionais | Parcial | Mecânica existente preservada; faixas claras no piso da garagem permanecem sob investigação. |
| Câmeras / clipping | Concluído e validado | 38/38 browser; 14×3×4 ambiente e 12 modos em teste de movimento; inspeção visual direta de quatro modos ×14 pistas. Não cobre toda trajetória temporal possível. |
| Luz / sombras | Concluído e validado | Cobertura extensa de pose, aceleração, frenagem, curvas, remoção, câmeras e pits; sem certificação GPU física. |
| Clima visual adicional | Pendente | Sistema existente mantido, sem expansão nova. |
| Desempenho | Parcial | Benchmark pareado reportado. Sob SwiftShader, frame intervals cresceram e geometria/calls aumentaram; sem alegar ganho de FPS. |
| Pacote independente | Pendente | CRC, hashes, instalação/build/testes extraídos a consolidar. |

## 7. Matriz de movimento — 34 itens

Estados se referem às condições efetivamente testadas, não a uma física perfeita. A regressão completa de produção (38/38) foi concluída. Nenhum vídeo antigo é apresentado como captura nova.

| # | Item | Estado | Evidência / limite |
|---:|---|---|---|
| 1 | Parado | Aprovado | Testes Node do observador: giro zero e ausência de oscilação inventada. |
| 2 | Largada | Parcial | Grid autônomo e capturas novas; regressão browser final pendente. |
| 3 | Reta lenta | Parcial | Movimento preservado; sem campanha visual específica sustentada. |
| 4 | Reta rápida | Parcial | Observador revalidado e corridas completas; revisão temporal limitada. |
| 5 | Curva fechada | Parcial | Heading/esterço testados; sem classificação visual exaustiva por raio. |
| 6 | Curva rápida | Parcial | Simulação preservada; sem GPU nativa/avaliação temporal completa. |
| 7 | Frenagem forte | Parcial | Dinâmica/pose testadas; regressão browser final pendente. |
| 8 | Aceleração na saída | Parcial | Sem ensaio visual dedicado de todas as saídas. |
| 9 | Transições | Aprovado | Interpolação e wrap de ângulo na suíte Node reexecutada. |
| 10 | Zebras | Parcial | Alturas/apoio testados; sem suspensão/pneu físico completo. |
| 11 | Lado a lado | Parcial | Capturas do grid e guarda SAT; envelope visual ainda pode exceder hitbox. |
| 12 | Ultrapassagem por dentro | Não executado | Sem novo ensaio isolado da linha de ultrapassagem. |
| 13 | Ultrapassagem por fora | Não executado | Mesmo limite; evento de overtake não comprova trajetória. |
| 14 | Curvas próximas | Parcial | Regressões de contato; limite de envelope preservado. |
| 15 | Frenagens próximas | Parcial | Sem certificação visual de todos os contatos entre pneus/bicos. |
| 16 | Mudança de faixa | Parcial | IA/estado idênticos em 14 provas, mas sem revisão visual de toda manobra. |
| 17 | Barreiras | Parcial | Física preservada; saliências visuais fora do hitbox continuam. |
| 18 | Entrada/saída de pit | Parcial | Matriz Node dos 14 circuitos aprovada; browser final pendente. |
| 19 | Todas as câmeras | Aprovado | 12 modos automatizados e quatro câmeras examinadas visualmente nos 14 circuitos; sequências temporais completas não certificadas. |
| 20 | Pausa/retomada | Parcial | Histórico testado; resultado browser final pendente. |
| 21 | Velocidade da simulação | Aprovado | Tick fixo e invariância de observação, sem nova fonte de tempo. |
| 22 | Resoluções | Parcial | Capturas 1280×720; matriz browser final pendente. |
| 23 | Grid completo | Aprovado | Seis carros e quatro rodas preservados; sem retirar bots. |
| 24 | Sombras | Aprovado | 5 testes de browser de pose/pixels/remoção/câmeras/pits aprovados; SwiftShader, não GPU física. |
| 25 | Rodas/carroceria | Aprovado | Rigs dos GLBs e apoio nominal revalidados; limites físicos anteriores mantidos. |
| 26 | Build | Aprovado | Build de produção atual executado, 85 módulos, com aviso de tamanho divulgado. |
| 27 | Inicialização | Aprovado | Teste production assets/startup passou no servidor estático 5201; assets locais. |
| 28 | Testes automatizados | Aprovado | 189 Node (155,218 ms) + 38 browser + validação de assets aprovados; build independente pendente de recriação final do ZIP. |
| 29 | Manager | Aprovado | 14 provas manager idênticas e testes browser do painel de manager aprovados. |
| 30 | Estratégia/pits | Aprovado | Testes browser de planos, serviço físico/filas/merge, presets e lifecycle passaram; animação da equipe segue limitada pela cadência existente. |
| 31 | Resultados | Aprovado | Persistência de resultados testada no browser e igualdade dos hashes das 14 corridas. |
| 32 | Carreira | Aprovado | Testes browser de campeonato, continuidade, recarga e temporada aprovados; não é auditoria de toda campanha possível. |
| 33 | Console/runtime | Aprovado | Capturas finais sem erros de console e 38 testes browser sem falhas no build de produção. |
| 34 | Frame rates variados | Parcial | Testes determinísticos não equivalem a FPS real; benchmark final pendente. |

## 8. Arquivos alterados e justificativa

### Código do jogo — somente um arquivo existente alterado
- `src/renderer.js`: integração do ambiente, geometria/cor do solo, filtragem/textura, acostamentos laterais, remoção do anel/cones substituídos, fachadas urbanas, materiais publicitários compartilhados e atualização visual antes das sombras.
- `src/graphics/EnvironmentPlan.js` (novo): perfis, posicionamento determinístico, exclusões conservadoras e cálculo de alcance/névoa.
- `src/graphics/EnvironmentVisuals.js` (novo): terreno distante, lotes auxiliares, instâncias/LOD por célula e descarte pelo ciclo existente.

### Testes, ferramentas e distribuição
- `tests/environment.test.js`, `tests/environment.spec.js` (novos): geometria, determinismo, LOD, câmeras/presets, população e imutabilidade da simulação em produção.
- `scripts/inspect-environment.js` (novo): captura comparável dos 14 circuitos/quatro câmeras.
- `scripts/diagnose-environment-depth.js`, `scripts/diagnose-environment-layers.js` (novos): isolamento de planos, sombras e superfície responsável pelo artefato.
- `scripts/compare-motion-simulation.js`: somente opção de caminho de saída, evitando sobrescrever a evidência histórica v0.9.
- `scripts/package-release.py`: versão/prefixo de saída derivados do pacote, proteção contra sobrescrita acidental da v0.9 e inclusão de documentação/provas novas.
- `package.json`, `package-lock.json`: versão 0.10.0; dependências inalteradas.
- `start.py`: rótulo da versão no terminal corrigido; servidor e rotas preservados.
- `README.md`, este relatório e `AUDITORIA-CENARIOS-v010.md`: escopo, auditoria, comandos e pendências.
- `playable/index.html` e bundle JS gerado: recompilação. CSS preservado. Logs/capturas/JSON em `tests/performance/environment/`; suítes preexistentes também atualizam suas próprias evidências nos diretórios históricos.

## 9. Distribuição e pendências

Vercel permanece estático: `npm ci`, `npm run build`, saída `dist`; sem Python/backend/env obrigatórios, sem CDN em runtime. **Não houve publicação na Vercel.** Localmente: `python start.py --port 5201`, ou Vite para desenvolvimento. ZIP final `/home/user/Apex-Dynasty-v0.10.0-Cenarios.zip`: fonte, assets, compilado local, lockfile, testes, licenças e documentação; extraído de forma independente, `npm ci`/build/189 Node/assets/15 GLBs e smoke browser de produção aprovados. CRC do arquivo e hashes do manifesto/payload conferidos; não inclui `node_modules`, caches nem credenciais.

Pendências explícitas: acabamento arquitetônico e acessos completos; litoral ainda estilizado/retilíneo; público/arquibancadas não redesenhados nesta revisão; expansão meteorológica visual; faixas claras do piso de garagem não resolvidas; linhas de visão não inspecionadas em todas as 12×14 combinações temporais; contato/envelope físico simplificados; ultrapassagens dedicadas por dentro/fora; GPU nativa e áudio subjetivo. Não houve redução de espectadores, bots, resolução padrão, sombras ou funcionalidades para esconder esses limites.
