# Auditoria pré-implementação — movimento v0.9

Data: 15/10/2026. Base: v0.8.1. Documento escrito antes de alterar o runtime.

## Integridade e execução inicial
- ZIP atual preservado: SHA256 `87d220774ecdbae3c1fb696e7969c491f6a98d27fe1a479b26998d3daaf4654c`; manifesto: 277/277 arquivos iguais antes de editar. Sem Git disponível. Comparação final será por hashes contra esse manifesto/ZIP.
- Referência extraída apenas em `.cache/motion-baseline`, fora da entrega, para comparação executável. Não recupera os sete ZIPs antigos excluídos.
- `npm ci`; `npx playwright install --with-deps chromium`; `npm test`: **158/158**, 88,528 s (Node 20.20.2). Logs em `tests/performance/v09/before-node.txt`.
- Chromium/SwiftShader real, 1280×720, build de produção original, seis carros: `node scripts/probe-motion.js before`. Console/pageerror: zero. JSON e imagem em `tests/performance/v09/`. A primeira execução da sonda falhou porque pressupôs quatro rodas articuladas; essa falha revelou o defeito de nomes do GLTF abaixo. Corrigida a sonda, sem alterar o jogo de referência.

## Arquitetura inspecionada
`main.js` → `core/Game.js`, um RAF; `core/GameLoop.js`, acumulador a 60 Hz com limite de 250 ms. `race.js` coordena manager, regras, pitInput, Physics, Resources, progresso/timing, colisões e resultados. `racing/Physics.js` detém posição, heading, velocidade e comandos; `recover` é uma descontinuidade explícita. `track.js`/`data/TrackGeometry.js` fornecem curva fechada plana compartilhada; 1920 amostras. `renderer.js` constrói cenário, GLTF/cache, clones e modelos personalizados, câmeras, efeitos e aplicação de poses. `models.js`/`optimize.js` preservam rodas separadas do batching. `DynamicShadows.js` já resolve matrizes atuais antes de depth/cor. `PitLayout`/`PitStop`/`PitVisuals` têm vagas e fases reais. Dispose rastreia geometria/material/textura; não substituir caches ou instanciamento. Testes Node/Playwright, build Vite, playable e scripts de distribuição presentes.

## Diagnóstico e plano rastreável
| ID / evidência | Causa / correção proposta | Risco / verificação |
|---|---|---|
| D1 confirmado em Chromium: carro GLB com apenas **1** item em `_wheels` | Renderer procura somente `name === 'wheel'`; GLTFLoader torna nomes únicos. Detectar grupos pelas extras booleanas `front` já exportadas, independentemente de sufixo. | Procedural/GLB, 12 modelos, exatamente quatro rodas, clones e ownership. Não regenerar assets. |
| D2 confirmado: 12 renders sem nenhum tick alteram spin em −1,9254 rad (valor modular) | `speed * renderDt / .58`, incorreto em pausa lógica, aceleração da simulação e múltiplos ticks. Registrar deslocamento longitudinal real por tick em WeakMap visual, sem campo novo nos carros/save. | Giro assinado, zero sem tick, 30/60/144 Hz, fast-forward, recover/reset. Comparar simulações completas. |
| D3 confirmado por composição matemática | Um Euler XYZ faz spin e esterço no mesmo nó: eixo esterçado muda ao girar. Separar pivô de direção e filho de rotação; body em grupo próprio. | Matriz do eixo invariável ao spin, quatro centros, sem draw calls adicionais; sombras depth/cor. |
| D4 confirmado em fonte: posição atual usada diretamente; não se consome alpha do FixedStep | Interpolar apenas dois estados autoritativos adjacentes, posição/heading com wrap, atraso máximo de um tick. Câmeras/effect center consomem a mesma pose. | Pausa, resultados, recuperação, colisão/descontinuidade, reset e simulação rápida. Não extrapolar nem alterar trajetórias físicas. |
| D5 confirmado pela geometria | Root .14 + centro .59 − raio .58 = .15, versus asfalto .12: vão nominal de 3 cm. Roll/pitch do root inclinam também rodas, em ordem Euler inadequada. Derivar apoio da superfície e raio; limitar atitude somente no corpo, por carga/aceleração lateral efetiva. | Pneus facetados têm variação de silhueta ~1 cm; suporte visual não é suspensão física. Testar contato/mesmos centros em headings diferentes. |
| D6 confirmado em fonte | Zebras são ribbons planos a .155 m, 1,5 m de largura, não sulcos 3D. Estimar contato local de cada roda pela projeção da pista e footprint. Resposta limitada à altura real, sem oscilador aleatório. | Projeção aproximada da malha discretizada; pit usa superfície .14, acostamento .095 e chão −.06. Documentar limites; não prometer pneus deformáveis. |
| D7 confirmado em fonte | Elevação de serviço troca instantaneamente entre .14/.28. Usar rampas da fase real e compartilhar coeficiente com macaco; preservar intervalo de troca e plateau .28 existente. | Não modificar tempo/estado de pit, reservas/merge. Testes de fases, elevação e manager. |
| D8 confirmado por Box3 | Modelo parado vai a Z+2.83; hitbox simétrico halfLength=2.73; rodas esterçadas podem exceder halfWidth=1.69. | Não aumentar hitbox indiscriminadamente (altera corridas/boxes). Medir e relatar limitação de colisão simplificada; manter regras. Batalhas reais exigem evidência, não declarar perfeitas. |
| D9 hipótese/limite | Câmeras em troca fazem corte explícito; chase tem smoothing próprio. Não é necessariamente bug. Cockpit deve seguir pose apresentada, não física atual diferente. | 12 modos, focus, resolução, serviço. Não adicionar replay. Manter cortes intencionais; não esconder saltos com câmera. |
| D10 não reproduzido nesta auditoria | Artefato triangular elevado em Neon consta da entrega anterior. | Reproduzir capturas comparáveis, não declarar consertado por alterações de movimento. |

## Sequência e fronteiras
1. Capturar baseline de performance com script existente e mesmas condições.
2. Observer visual de ticks + rig local; renderer/câmera com uma pose final; apoio e fase de macaco compartilhados. Sem engine/biblioteca nova, sem tocar escolhas do manager, regulamento, saves, IA ou hitbox.
3. Testes unitários novos e suites existentes; Chromium, screenshots/câmeras e métricas. Comparar fontes/135 assets e simulação determinística contra referência.
4. Relatório A–F e matriz de 34 itens com evidência e pendências, sem converter build pass em validação visual.

O objetivo é corrigir causas comprovadas. Não há aqui alegação de ganho de FPS, física completa, ultrapassagens perfeitas ou inspeção humana de vídeo. Resultados novos serão registrados separadamente após execução.
