# Apex Dynasty v0.9.0 — movimento e apresentação

**BUILD THE TEAM. MASTER THE RACE.**  
Revisão do projeto existente • 15/10/2026

## Resumo executivo

**Classificação: Implementado parcialmente.** O núcleo de movimento visual foi corrigido e executado: quatro rodas GLB, pivôs separados, giro por deslocamento simulado, interpolação ligada ao loop real, atitude somente na carroceria, apoio nas superfícies existentes e elevação progressiva do serviço. A simulação continua autoritativa.

**Não é uma certificação de todos os requisitos do prompt.** Permanecem limites do envelope de colisão, contato/suspensão simplificados, validação incompleta de ultrapassagens por dentro/fora e ausência de validação em GPU física. Na comparação final SwiftShader com o mesmo servidor estático, três médias de frame ficaram **0,68% a 3,26% piores** e uma **1,33% melhor**. Não há promessa de ganho geral de FPS.

- Referência v0.8.1 preservada, SHA256 `87d220774ecdbae3c1fb696e7969c491f6a98d27fe1a479b26998d3daaf4654c`.
- **135/135 assets públicos idênticos**, sem redução de carros, arquibancadas, público, sombras ou funcionalidades.
- **14 corridas manager completas de três voltas**: igualdade exata entre referência/revisão de carros, eventos, decisões e resultados.
- **174 testes Node aprovados** na instalação extraída com Node 24. A primeira regressão Chromium aprovou 36 testes; quatro testes de movimento também passaram na árvore principal. A regressão final completa aprovou **37/37 testes Chromium na cópia extraída**, sem falhas, skips ou flaky.
- Dois vídeos reais do motor, antes/depois, 192 frames cada: **captura offline**, reprodução a 30 fps. Isso **não mede nem demonstra execução a 30 fps** no sandbox.

---

## A — Diagnóstico

A auditoria anterior às mudanças está em `docs/AUDITORIA-MOVIMENTO-v09.md`. O trabalho não começou pela substituição do motor, modelos ou física. A base foi inspecionada e comparada por manifesto, pois não havia Git disponível. O ZIP atual foi extraído em cache somente para referência/QA; nenhum dos sete ZIPs antigos excluídos foi recriado.

### Defeitos confirmados e tratados

1. **Três rodas GLB não eram articuladas.** `renderer.setMode` procurava o nome exato `wheel`. GLTFLoader converte os demais nomes para `wheel_1`, `wheel_2`, `wheel_3` e usa `Object3D`, não necessariamente `Group`. A sonda Chromium encontrou uma única roda na lista. A identificação agora usa o metadado booleano `front`, já exportado nos 12 assets.
2. **Giro dependia do relógio de render.** Doze renders sem tick alteravam a roda em −1,9254 rad no valor modular da sonda. Agora a diferença é zero. O cálculo usa o deslocamento longitudinal de cada centro de roda, incluindo a rotação real do corpo entre ticks, dividido pelo raio de 0,58 m.
3. **Eixo de giro e esterço competiam no mesmo Euler.** O spin no X e o esterço no Y do mesmo nó faziam o eixo esterçado depender da fase de giro. Um pivô Y agora contém um filho de spin X. O eixo permanece invariável ao longo de uma volta completa no teste matricial.
4. **Não havia interpolação da pose no render principal.** O acumulador a 60 Hz já existia, mas seu alpha não era consumido. Agora são usados somente os dois estados adjacentes completos, incluindo heading com wrap. Não existe uma segunda trajetória ou extrapolação.
5. **Atitude do root afetava o contato das rodas.** Pitch/roll agora ficam no corpo, num pivô local a 0,7 m; o root aplica apenas heading. Contato nominal é calculado pela altura da superfície + raio − centro local, não por offset global arbitrário.
6. **Elevação de serviço era um degrau.** Carro e macaco passam a usar a mesma função da fase real, com subida entre 6–14% e descida entre 86–94% do serviço. O plateau do carro continua em 0,28 m, preservando o contrato dos testes anteriores. Não foi alterado o tempo de parada.
7. **Risco de voltar um tick ao retomar em alta taxa de frames.** A revisão colapsa o histórico visual em pause/resume e mudanças de estado, sem zerar a fase das rodas. O teste chama o `Game.frame` verdadeiro a intervalos de 1/144 s e retoma antes do próximo tick; o carro não recua.
8. **Interpolação não pode introduzir penetração adicional.** Além de tratar impactos/correções/recuperações como cortes, a apresentação compara pares próximos com o SAT existente. Se a interpolação piorar a penetração em relação ao estado físico, o grid inteiro apresenta o tick corrigido. Não desloca modelos para fora da física e não esconde colisões reais.

### Limites confirmados, não resolvidos

- **Envelope de colisão:** modelo vai a Z +2,83 m, enquanto o hitbox termina em +2,73 m. Com esterço de 0,15 rad, os vértices transformados dos pneus excedem a largura física em aproximadamente 6,15 cm por lado; a 0,45 rad, em 19,14 cm (Box3 com cálculo preciso). São limites geométricos medidos, não alegação de colisões perfeitas. Alterar hitbox, buffers da IA e corredores de pit requer uma rodada física própria; não foi feito como disfarce visual nesta revisão.
- **Suspensão/contato são apresentação estimada**, não física vertical, pneu deformável ou suspensão independente simulada. A pista é plana; a projeção local e a largura do pneu estimam apoio sobre ribbons discretizados. Há variação de silhueta de cerca de 1 cm por causa dos pneus facetados.
- **Zebras não têm sulcos modelados.** São superfícies planas 3,5 cm acima do asfalto. Não foi adicionada vibração periódica inventada. A resposta acompanha apenas a passagem do footprint pelas alturas existentes.
- **Esterço é a representação da curvatura efetivamente executada**, limitado a ±0,45 rad, não uma simulação de cremalheira/Ackermann. Abaixo de 0,2 m/s retorna a zero; não há nova mecânica de esterçamento parado.
- A equipe de pit conserva o detalhe/atualização amortizada de 15–30 Hz conforme proximidade. A fase/tempo é autoritativa, mas a pose instanciada pode ficar até um intervalo de atualização atrás do carro. Não se declara sincronismo subframe perfeito.

### Hipóteses ou pontos não reproduzidos nesta rodada

- O artefato triangular em câmera elevada de Neon documentado na v0.8.1 **não foi declarado corrigido**. As evidências históricas seguem em `tests/performance/v081/diagnostic-neon-*.jpg`; não houve nova reprodução dedicada da mesma câmera para encerrá-lo.
- A variação do benchmark não permite diagnosticar o hardware do usuário, GC ou tempo de conclusão GPU. Não houve teste em GPU física ou medição confiável de VRAM.
- As trocas de câmera continuam sendo cortes intencionais. Não foram classificadas automaticamente como defeito nem substituídas por transições que cruzem cenário.

## B — Arquivos e alterações

### Runtime: quatro arquivos existentes e dois novos

| Caminho | Problema / alteração e justificativa |
|---|---|
| `src/graphics/VehicleMotion.js` **novo** | Observer em WeakMap, dois samples por carro, odômetros por roda, wrap angular, pitch/roll limitados, cortes e reset temporal, coeficiente compartilhado de elevação. Não escreve nos carros/save. Base trigonométrica reutilizada entre as quatro rodas. |
| `src/graphics/VehiclePresentation.js` **novo** | Rig de corpo/pivô/spin compatível com GLB e procedural; apoio derivado das superfícies; aplicação única da pose; guarda contra penetração adicional da interpolação. Reusa geometria/material e buffers. |
| `src/race.js` | `step` observa antes/depois de `advanceSimulation`; o corpo anterior da simulação é preservado. Rejeita dt inválido/não positivo e reseta apenas histórico visual nas transições/pausa. |
| `src/core/Game.js` | Passa alpha do acumulador ao render; simulação acelerada apresenta o estado atual. Um RAF e física a 60 Hz permanecem. |
| `src/renderer.js` | Instala rig por clone, remove integração de rodas por renderDt e tilt do root; usa views reutilizadas da pose final para câmeras/centro dos efeitos/equipe. Matriz final continua anterior a sombras e cor. Compartilha dimensões de ribbon. |
| `src/graphics/PitVisuals.js` | Compartilha altura do piso e coeficiente de elevação do macaco; preserva crew instanciado, fases, limites e throttling existentes. |

**Sem alteração** em `Physics.js`, `CollisionSystem.js`, IA, geometria/traçado dos circuitos, `PitStop.js`, `PitLayout.js`, `DynamicShadows.js`, manager, regras, classificações, carreira, áudio e arquivos de save. A animação não decide classificação nem duração de serviço.

### Testes, ferramentas, documentação e distribuição

- Novos `tests/motion.test.js` (16 casos) e `tests/motion.spec.js` (4 casos).
- Novos `scripts/probe-motion.js`, `capture-motion.js`, `compare-motion-simulation.js`, `benchmark-motion-cpu.js`.
- `package.json` / `package-lock.json`: somente identificação 0.9.0; dependências e versões preservadas.
- `README.md`: entrada da revisão e links; histórico preservado.
- `scripts/package-release.py`: nome/prefixo/manifesto 0.9.0 e inclusão de relatório/evidências novas; cache/dependências/secrets continuam excluídos.
- `playable/index.html` e chunk JS reconstruídos. O chunk antigo `index-CloqIkPt.js` foi substituído pelo gerado `index-C03bCRfm.js`; não foi removido asset de conteúdo. CSS permanece igual.
- Novos documentos desta revisão e evidências em `tests/performance/v09/`.
- Lista objetiva e diff dos quatro arquivos existentes: `source-diff.json` e `runtime-diff.txt` nessa pasta. Suítes antigas permanecem sem alteração; seus artefatos regeneráveis podem ser atualizados por execução.

## C — Resultado por sistema

| Sistema | Implementado / limite |
|---|---|
| Movimento / interpolação | Dois ticks completos, alpha real do acumulador, atraso de apresentação de no máximo um tick; sem filtro cumulativo de posição. Pause, results, red, recover e correções não extrapolam. |
| Trajetória / orientação | Traçado/IA físicos intocados; heading pelo arco curto; coordenada de câmera com wrap da volta. Não há uma pista visual independente. |
| Esterço | Duas rodas dianteiras, pivô Y separado; traseiras sem esterço. Ângulo deriva da rotação efetiva/speed; modelo simplificado, sem Ackermann ou esterço parado. |
| Giro | Distância longitudinal de cada centro, sinal e raio físico nominal; render sem tick não avança. Não reduz artificialmente a rotação para a câmera. Aliasing temporal em altas velocidades continua possível. |
| Frenagem / aceleração | Pitch limitado responde à carga física existente; não há novo efeito de disco quente ou travamento inventado. |
| Suspensão / contato | Corpo separado das rodas; apoio estimado por roda, sem deformação de mesh nem mudança física de aderência. Não é uma nova suspensão física. |
| Zebras | Altura real + footprint; sem ruído, textura tratada como relevo ou vibração perpétua. |
| Carroceria | Pitch ±0,018 rad e roll ±0,026 rad de carga, mais inclinação de apoio; retorno no relógio de simulação. Não inclina o conjunto dos pneus pelo roll estético. |
| Disputas / separação | Guarda da interpolação implementada, SAT e IA preservados. Envelope físico menor que certas partes do modelo permanece: sobreposição visual em contatos próximos ainda é possível. |
| Sombras | `pose → matrizes → depth → cor` mantido. Não foram desligadas, reduzidas ou atualizadas em frames alternados. Testes com sombras desligadas são somente controles de benchmark. |
| Câmeras | Os 12 modos existentes continuam; cockpit segue a mesma pose do carro. Chase mantém smoothing próprio, sem decidir movimento. Safety Car continua com seu estado atual, sem novo interpolador próprio. |
| Boxes | Entrada/serviço/saída/reservas/merge continuam reais; rampa usa fase real e plateau compatível. Throttling da equipe permanece, com limite de sincronismo já descrito. |
| Performance | Buffers/views/grupos reutilizados; sem novos meshes/draw calls na cena comparada. Há custo adicional do observer e dos movimentos corrigidos; não foi obtida redução geral do tempo de frame. |

## D — Execuções, evidências e medições

### Comandos executados

```bash
npm ci
npx playwright install --with-deps chromium
npm test
node --test tests/motion.test.js
npx --package=node@24 -c 'npm run build'
python scripts/refresh-playable.py
npm run assets:validate
GAME_URL=http://localhost:5200 node scripts/probe-motion.js before
GAME_URL=http://localhost:5201 node scripts/probe-motion.js after
GAME_URL=http://localhost:5201 npx playwright test
GAME_URL=http://localhost:5201 npx playwright test tests/motion.spec.js
node scripts/compare-motion-simulation.js /home/user/.cache/motion-baseline/Apex-Dynasty-v0.8.1
node scripts/benchmark-motion-cpu.js /home/user/.cache/motion-baseline/Apex-Dynasty-v0.8.1
GAME_URL=http://localhost:5200 node scripts/benchmark-stability.js motion-before
GAME_URL=http://localhost:5201 node scripts/benchmark-stability.js motion-after
GAME_URL=http://localhost:5203 node scripts/benchmark-stability.js motion-after-static
python scripts/package-release.py --output /home/user/.cache/v09-candidate.zip
# Diretório extraído, instalação independente:
npx --package=node@24 -c 'npm ci && npm run build && npm test && npm run assets:validate'
GAME_URL=http://localhost:5202 npx --package=node@24 -c 'npm run test:browser'
```

Portas são locais do sandbox, não publicação Vercel. A versão para entrega tem `npm ci → npm run build → dist`, Node 24.x, Vite estático, sem backend/env/CDN. `start.py` é apenas opção local histórica; não é necessário no deploy.

### Resultados já executados

| Verificação | Resultado / evidência |
|---|---|
| Integridade antes da edição | 277/277 hashes da referência iguais. |
| Node baseline | 158/158; 88,528 s; `before-node.txt`. |
| Node primeira implementação | 172/172; 102,692 s; `after-node.txt`. |
| Node final extraído | **174/174**, 107,359 s; `extracted-install-build-node.txt`. Sem skips/falhas. |
| Chromium primeira regressão | 36/36, 14,7 min; `after-browser.txt`, `browser-results.json`. Inclui todos os 33 antigos. |
| Chromium movimento com transições | 4/4, 29,4 s; `motion-browser-final.txt`. A última reutilização de base trigonométrica é coberta também no pacote extraído. |
| Chromium final extraído | **37/37**, 14,3 min; `extracted-browser.txt`, `extracted-browser-results.json`. 33 antigos + 4 novos, zero falhas/skips/flaky. |
| Build | 83 módulos, JS 930,34 kB / 266,21 kB gzip; aviso >500 kB continua não fatal. |
| Assets | 15 GLBs validados; todos os 135 arquivos públicos iguais ao baseline. |
| Independência da simulação | 14 corridas completas, de 14.759 a 24.412 ticks, igualdade exata de hash de carros/resultados/eventos/manager. `authoritative-comparison.json`. |
| Giro sem tick | Antes −1,9254 rad modular; depois zero. Uma roda listada antes, quatro depois. `*-motion-probe.json`. |
| Loop real | Chamadas do `Game.frame` a 144 Hz com movimento entre ticks; pause/resume antes do próximo tick sem recuo. `frame-loop.json`. Não é benchmark de 144 fps reais. |
| Câmeras / contato / sombras | `camera-rigs.json`, `contact-shadows.json`, capturas `visual/camera-*` e `visual/contact-*`; testes de depth/cor e diferencial de pixels existentes. |

### Capturas e limites da inspeção visual

Foram abertas e examinadas as imagens de antes/depois das rodas, contato em zebra, cockpit, câmera de batalha e frames decodificados dos vídeos. Não houve ensaio humano interativo, validação em GPU física nem avaliação subjetiva de áudio nesta rodada. Há capturas dos 12 modos. Os cenários de contato estacionário incluem fixtures explícitas de teste; não se apresentam como voltas espontâneas de gameplay. As fases reais de pit são exercitadas separadamente pelos testes antigos.

`before-motion.webm` e `after-motion.webm`: 192 imagens reais do render, 960×540, seis carros, qualidade Medium, 6,4 s de reprodução. Incluem parado, largada autônoma e corte explícito para uma frenagem real. São capturados offline com ticks fixos, não um vídeo de desempenho em tempo real. Ambos foram decodificados no Chromium; metadados em `video-validation.json`. Não se declara que uma pessoa assistiu integralmente a todos os casos em hardware nativo.

Comandos de captura efetivamente iniciados (captura concluída; a codificação inicial falhou como descrito abaixo):

```bash
GAME_URL=http://localhost:5200 FFMPEG=/home/user/.cache/ms-playwright/ffmpeg-1013/ffmpeg-linux node scripts/capture-motion.js before
GAME_URL=http://localhost:5201 FFMPEG=/home/user/.cache/ms-playwright/ffmpeg-1013/ffmpeg-linux node scripts/capture-motion.js after
```

A recuperação executou `spawnSync` do FFmpeg para cada conjunto, com argumentos `-y -f image2pipe -r 30 -c:v mjpeg -i pipe:0 -c:v libvpx-vp9 -b:v 1300k -deadline realtime -pix_fmt yuv420p <arquivo.webm>` e `input` contendo os 192 JPEGs ordenados concatenados. Logs finais: `before-encoding.txt` e `after-encoding.txt`. O script entregue já incorpora essa correção; não é dependência de execução do jogo.

Falhas de ferramenta resolvidas e registradas: primeira sonda pressupunha duas rodas e encontrou apenas uma; primeira seleção de rig assumia `Group`, mas os nós GLTF eram `Object3D`; o limite inicial de 24.000 ticks da comparação acabou durante `finishing` em Emerald e foi ampliado (corrida termina em 24.412 ticks, não havia deadlock). O FFmpeg compacto do Playwright não aceitava sequência de arquivos; as imagens completas foram preservadas e codificadas via `image2pipe` com codec MJPEG explícito. Os vídeos foram depois decodificados com sucesso. Nenhuma dessas falhas foi mascarada com `try/catch` no jogo.

### Performance comparável — sem promessa de ganho

Mesmo Chromium/SwiftShader e mesmo `start.py` servindo os builds estáticos (referência porta 5200, revisão 5203), 1280×720, Custom equivalente Alto, seis carros, chuva, público e cenário completos. Aurora/Neon, sombras 1024 ou controle desligado. 20 frames de aquecimento + 80 medidos, seis ticks de 1/60 por frame. Áudio excluído desse benchmark, mas coberto funcionalmente. O render desse script usa o estado atual (alpha padrão 1); o custo da guarda SAT em frames interpolados não está isolado nessa comparação.

| Cenário | Média ms antes → depois | P95 ms | P99 / máximo ms |
|---|---:|---:|---:|
| Aurora, sombras 1024 | 367,44 → 369,95 | 452,20 → 464,00 | 476,90 → 610,00 |
| Aurora, controle sem sombra | 317,96 → 328,33 | 416,80 → 425,20 | 446,20 → 443,70 |
| Neon, sombras 1024 | 364,16 → 368,45 | 446,70 → 450,00 | 476,40 → 483,80 |
| Neon, controle sem sombra | 282,14 → 278,39 | 348,10 → 342,90 | 402,50 → 386,00 |

Três médias pioraram e a de Neon sem sombras melhorou. O pico de Aurora com sombra chegou a 610 ms. Isso não pode ser comunicado como otimização global. Uma primeira medição da revisão via Vite preview teve as quatro médias piores (1,92% a 5,71%); foi preservada em `after-browser-benchmark-vite.json`, mas a tabela final repete a revisão usando o mesmo servidor da referência, eliminando essa diferença metodológica. Não foi escolhido o melhor resultado entre runs idênticos. São intervalos de frame em renderização por software, não GPU completion time. Com 80 amostras, P99 coincide com máximo e não caracteriza uma sessão longa.

| Cenário | CPU de seis ticks, média ms antes → depois | Submissão render, média ms |
|---|---:|---:|
| Aurora / 1024 | 1,2025 → 1,3475 | 2,7475 → 2,9850 |
| Aurora / 0 | 1,2200 → 1,3063 | 2,1738 → 2,6900 |
| Neon / 1024 | 1,3225 → 1,2925 | 2,7637 → 2,9088 |
| Neon / 0 | 1,0025 → 1,5575 | 2,2013 → 2,7012 |

Contagens antes/depois são iguais em cada cenário: **135/85/144/92 draw calls**, **95.264/80.912/100.910/86.090 triângulos**, **129/129/127/126 geometrias**, **26/26/27/25 texturas**, seis carros e mesmo público. Dados de carregamento, heap, programas, UI e todos os percentis constam de `before-browser-benchmark.json`, `after-browser-benchmark.json` e `performance-summary.json`. Heap é apenas observação do browser, não prova de VRAM/GC.

Microbenchmark de CPU alternando antes/depois no mesmo processo Node, cinco runs aquecidos de 6.000 ticks/100 s simulados: **257,25 → 281,59 ms** (custo adicional de aproximadamente **0,0041 ms por tick do grid**, +9,46% nesse microbenchmark). Os resultados físicos são iguais. A primeira implementação mediu 245,85 → 285,59 ms; a base trigonométrica foi compartilhada por roda para evitar cálculos repetidos. A amostra pequena/variável não sustenta porcentagem universal de ganho dessa alteração. Dados completos em `cpu-observer-initial.json` e `cpu-comparison.json`.

### Matriz obrigatória — 34 itens

“Aprovado” refere-se aos testes e condições descritos, não a todas as GPUs/circuitos/situações possíveis. “Parcial” não equivale a requisito encerrado.

| # | Item | Estado | Evidência / motivo |
|---:|---|---|---|
| 1 | Parado | Aprovado | Giro zero sem tick; trecho inicial dos vídeos; apoio nominal medido. |
| 2 | Largada | Aprovado | Sequência autônoma real e clip; observer lê deslocamento, não tempo de render. |
| 3 | Reta lenta | Parcial | Amostras 8–25 m/s e lançamento; não há ensaio visual dedicado sustentado de todas as retas. |
| 4 | Reta rápida | Aprovado | Amostras >50 m/s, testes de aceleração/sombras e invariância de spin por relógio. |
| 5 | Curva fechada | Parcial | Curvas reais e limites de atitude/esterço; sem campanha visual específica classificada por raio. |
| 6 | Curva rápida | Parcial | Sequência de corrida/render; falta validação temporal humana em GPU física. |
| 7 | Frenagem forte | Aprovado | Frenagem real selecionada no vídeo, amostras brake >0,5, testes de pose/depth/cor. |
| 8 | Aceleração na saída | Parcial | Transições por piloto registradas e pitch real; sem cobertura visual exaustiva de saídas. |
| 9 | Transição reta/curva | Aprovado | Heading contínuo/wrap e loop real com alpha; sem pista visual paralela. |
| 10 | Zebras | Parcial | Footprint e altura real testados/capturados; contato estimado, sem pneu/suspensão física. |
| 11 | Lado a lado | Parcial | Captura de grid e guarda SAT; envelope visual pode exceder hitbox. |
| 12 | Ultrapassagem por dentro | Não executado | Nenhum ensaio novo isolado que classifique e valide visualmente essa manobra. |
| 13 | Ultrapassagem por fora | Não executado | Mesmo limite; eventos de overtake não provam a linha usada. |
| 14 | Curvas próximas | Parcial | Testes de colisão e corridas completas; limite de envelope permanece. |
| 15 | Frenagens próximas | Parcial | Física/contato existentes preservados; sem certificação visual de todo contato de bico/pneu. |
| 16 | Mudanças de faixa | Parcial | IA/traçado preservados e resultados idênticos; não foi revalidada visualmente toda manobra. |
| 17 | Barreiras | Parcial | Regressões físicas passam; saliências fora do hitbox impedem afirmar contato visual perfeito. |
| 18 | Entrada/saída de pit | Aprovado | Matriz física dos 14 circuitos e testes browser de entrada, serviço, release, merge. |
| 19 | Todas as câmeras | Parcial | 12 modos capturados; cockpit coerente. Pendência elevada Neon e inspeção temporal limitada. |
| 20 | Pausa/retomada | Aprovado | Histórico colapsado; teste do Game.frame antes do próximo tick, sem recuo/giro extra. |
| 21 | Velocidade da simulação | Aprovado | Ticks batched/fast-forward, odômetro independente de dt gráfico, simulação invariável. |
| 22 | Resoluções/aspectos | Aprovado | 1920×1080, 1280×720, 390×844 novos + matriz HUD anterior reexecutada. |
| 23 | Grid completo | Aprovado | Seis carros, 24 rodas articuladas; nenhum bot removido. |
| 24 | Sombras | Aprovado | Cinco testes browser antigos, mesmas matrizes depth/cor, pixels de remoção e lifecycle. |
| 25 | Rodas/carroceria | Aprovado | 12 GLBs + procedural, eixo estável, rear neutro, grupo de corpo e contato nominal. Limitado ao modelo visual descrito. |
| 26 | Build de produção | Aprovado | Build Node 24 principal e extraído; aviso de chunk explicitado. |
| 27 | Inicialização | Aprovado | Assets locais, pronto real, fallback e erros úteis; sem backend. |
| 28 | Suítes existentes | Aprovado | 174/174 Node e 37/37 Chromium no pacote extraído, incluindo as 158/33 antigas sem alteração. |
| 29 | Manager | Aprovado | UI ao vivo, planos independentes e 14 comparações exatas de corridas completas. |
| 30 | Estratégia/pits | Parcial | Regras/tempos/filas/merge aprovados; crew retém throttling, sem sincronismo subframe garantido. |
| 31 | Classificação/resultados | Aprovado | Hashes exatos nas 14 provas; regressões de resultados e pontuação. |
| 32 | Carreira | Aprovado | Temporadas, persistência, contratos/admin e anti-recompensa duplicada na suíte browser. |
| 33 | Console/runtime | Aprovado | Sondas normais sem erros inesperados; testes de falha de asset são injeções deliberadas e tratadas. |
| 34 | Variação de frame rate | Parcial | 30/60/144 Hz determinísticos e Game.frame a 144 Hz lógico; não são 144 fps reais. Benchmark software teve médias mistas, três cenários piores. |

## E — Preservação, distribuição e pendências

O jogo continua manager-first e autônomo por padrão. Nenhuma câmera ativa manual, nenhum timing visual concede volta, serviço ou vitória. Carreira, estratégias, SC/VSC/red, clima, dano, classificação, contratos, controles opcionais, música/torcida, arquibancadas e qualidade permanecem.

A prova mais forte de preservação é a comparação de estado completo em 14 corridas, somada às suítes antigas. Isso não é uma prova matemática de ausência de toda regressão possível. Saves não foram apagados nem migrados por esta revisão. Não houve alteração em credenciais, outros projetos ou no ZIP v0.8.1.

O pacote final inclui fonte, assets, playable reconstruído, lockfile, configuração Vercel, testes, scripts, licenças, diagnóstico/relatório e evidências. Não inclui node_modules, caches, servidor permanente ou secrets. O fechamento confere CRC e os 285 hashes do payload contra a cópia extraída testada, incluindo igualdade do build independente com `playable`. Documentação/evidências adicionadas após os testes não mudam o payload executável.

**Pendências concretas:** resolver envelope físico/visual com teste da IA e das folgas dos boxes; validar ultrapassagens por dentro/fora e contatos muito próximos; repetir inspeção de Neon elevada; certificar movimento e performance em GPU física; decidir se o requisito pede rack/Ackermann/esterço parado e suspensão física (não implementados); refinar sincronismo da equipe sem piorar CPU.

## F — Classificação final

**Implementado parcialmente.** Há correções funcionais e evidência real, não apenas auditoria ou protótipo. A camada visual foi integrada ao jogo existente e a simulação foi preservada nas comparações executadas. Entretanto, não seria correto marcar todo o prompt como “Concluído e validado”: permanecem os itens parciais/não executados da matriz e não houve ganho global de performance demonstrado.
