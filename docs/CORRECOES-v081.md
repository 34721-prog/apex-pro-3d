# Apex Dynasty v0.8.1 — relatório de correção e publicação estática

**Resultado:** fonte existente preservada, correções locais, build estático preparado para Vercel. **158 testes Node e 33 testes Chromium aprovados na extração independente final**, sem falhas, ignorados ou flaky. Não houve deploy público. Não há alegação de eliminação universal de travadas nem certificação de 60 FPS.

## 1. Problemas identificados — causas técnicas

1. **Duas estruturas sobre o mesmo pit:** `buildScenery` ainda construía um paddock antigo com 12 portas em cima das seis garagens físicas. A posição vinha de uma extensão da tangente de `at(0)`, diferente do referencial local usado pelos boxes. Sobreposição de footprints reproduzida nos 14 circuitos. Em Aurora, 20 amostras do asfalto principal também invadiam o footprint do prédio antigo.
2. **Comprimentos incompatíveis com curvas:** a cobertura tinha 26 m, igual ao espaçamento medido no eixo da pista. No offset de 50 m, a curva interna encurta o espaçamento real. Coberturas/divisórias de vizinhos se interceptavam nas seis pistas originais. O validador anterior só inspecionava pontos contra trechos remotos, não os pares de footprints.
3. **Inicialização não idempotente:** uma chamada repetida de `buildPit()` acrescentava outro conjunto de objetos. Não foi constatado acúmulo espontâneo no fluxo normal de troca de `World`, cujo descarte já funcionava.
4. **Prédios urbanos sem reserva de espaço para o pit:** Neon e Old Town podiam colocar edifícios decorativos nas instalações anexas. A inspeção visual detectou essa lacuna adicional; apenas verificar pista/arquibancadas não era suficiente.
5. **Trabalho geométrico repetido no estimador:** 96 curvaturas e 64 segmentos do pit lane eram recalculados em consultas sucessivas, apesar de permanecerem constantes durante a corrida. Picos de recomendações foram medidos; não se atribuiu genericamente todo pico a garbage collection.
6. **Prontidão incompleta:** `World.ready` esperava o GLB principal, não todas as texturas. Programas de cor eram preparados no primeiro desenho. Falhas do GLB ficavam principalmente no console. A página inicial não possuía um estado de carregamento anterior à criação da interface.

## 2. Correções realizadas

- `PitLayout` continua sendo a fonte comum. Vagas, entrada/saída, trajetória e velocidade do pit permanecem iguais. A extensão de cada garagem é ajustada pela distância real entre centros no offset do prédio; paredes físicas e visuais usam a mesma dimensão. Não se deslocaram carros para acomodar a correção.
- Paddock e torre usam posições locais descritas no mesmo layout, atrás das garagens e fora da faixa dirigível. O paddock não foi apagado nem escondido. Edifícios urbanos que conflitam são reposicionados por busca limitada, considerando footprints do pit, pista e arquibancadas; **28 edifícios antes/depois em cada um dos dois circuitos urbanos**.
- Um grupo de pit por `World`, retornado em chamadas repetidas. Batching é feito dentro do grupo, preservando sua posse; troca de circuito continua descartando recursos antigos.
- Cache somente de geometria por identidade da curva: pneus, clima, combustível, serviço, tráfego, adversários e decisões continuam sendo recalculados com dados atuais. Resultado numérico do microbenchmark permaneceu exatamente igual.
- LoadingManager local acompanha texturas e GLB. `ready` espera os recursos e `compileAsync` dos programas de cor; render não usa um World ainda incompleto/descartado. A corrida não avança automaticamente enquanto a cena não está pronta. Isso não altera os 60 Hz da física nem cria outro simulador.
- Indicador inicial indeterminado, avisos úteis para recursos ausentes e erro de preparação visível, com detalhes no console. Mantido o fallback procedural original do próprio jogo para falha do GLB; nenhum asset foi substituído por placeholder. Não há percentual fictício.
- Mantida a criação síncrona original de `Game`: uma tentativa de adiá-la gerou uma corrida de inicialização nos testes e foi revertida, sem alterar os testes antigos. Preparação de recursos/shaders permanece assíncrona.

## 3. Arquivos modificados — lista exata do código e configuração

| Arquivo existente | Justificativa |
|---|---|
| `src/strategy/PitLayout.js` | Extensões locais de garagens, anexos e exclusão geométrica de cenário urbano. |
| `src/graphics/PitVisuals.js` | Grupo único idempotente, dimensões compartilhadas, batching do próprio conjunto. |
| `src/renderer.js` | Consome poses comuns, respeita exclusão do pit, rastreia recursos e prepara shaders. |
| `src/strategy/StrategyEstimator.js` | Cache de geometria invariante, sem cache de decisões/estado dinâmico. |
| `src/core/Game.js` | Estado/erro de preparação e espera de prontidão antes do avanço automático. |
| `src/main.js` | Finalização do indicador de carregamento, aviso de recurso ausente e erro útil. |
| `index.html` | Indicador indeterminado já presente no HTML inicial. |
| `package.json` | Identificação 0.8.1; dependências/comandos preservados. |
| `package-lock.json` | Identificação 0.8.1 nos metadados da raiz; dependências preservadas. |
| `.gitignore` | Não versionar `.vercel` e `.env*`. |
| `README.md` | Versão, instruções locais e links de deploy/validação. |
| `scripts/package-release.py` | Nome/manifesto da entrega e inclusão de configuração/documentação/evidências novas. |

**Adicionados:** `vercel.json`, `.vercelignore`, `scripts/benchmark-stability.js`, `scripts/benchmark-estimator.js`, `tests/stability.test.js`, `tests/stability.spec.js`, `docs/AUDITORIA-v081.md`, `docs/CORRECOES-v081.md`, `docs/VERCEL.md`.

**Gerados:** `playable/index.html` e seu novo chunk JS substituem o build anterior; o CSS não mudou. Evidências novas em `tests/performance/v081/`; saídas históricas dos testes podem ser regeneradas pelos comandos. `payload-changes.json` lista os nomes dos arquivos de payload alterados/adicionados/removidos; os hashes estão em `PAYLOAD-MANIFEST.json`. A única remoção do payload original é o chunk JS antigo substituído pelo build novo; nenhum asset foi removido.

São **seis módulos JS de runtime alterados**, mais o HTML de entrada. Não foram alterados `race.js`, `GameLoop.js`, `CollisionSystem.js`, `TrackGeometry.js`, `tracks.js`, `track.js`, `DynamicShadows.js`, `Effects.js`, sistemas de áudio, arquibancadas, regras, carreira ou saves. Os testes existentes são byte a byte os mesmos. Todos os **135 arquivos de public** são byte a byte iguais ao ZIP v0.8.

## 4. Boxes — circuitos e verificações

Verificados: **Aurora, Veloce Highlands, Serpente Valley, Porto Neon, Titan Ring, Costa do Vento, Sahara Speedway, Alpine Crown, Emerald Forest Ring, Old Town Grand Prix, Sunset International, Nordic Storm Circuit, Desert Night Run e Discovery Circuit**.

- Footprints completos contra todas as amostras da pista, contra outras garagens/anexos e arquibancadas; edifícios urbanos contra os mesmos volumes.
- Seis vagas com IDs únicos; duas chamadas adicionais de construção não aumentam malhas nem criam outro grupo/equipe.
- Paredes e bancadas renderizadas correspondem aos 24 volumes físicos do layout, dentro de 1 mm no teste de matrizes.
- Entrada/saída coincidem com a pista; continuidade da rota amostrada de metro em metro, vagas alinhadas à tangente local.
- Seis carros completam parada física e retorno em cada circuito; exclusividade da vaga e limite de deslocamento por tick. Os testes anteriores continuam cobrindo fila da mesma equipe, chuva, colisões, serviço, penalidades e merge.
- Limites geométricos específicos: a interseção do asfalto do pit com a pista **nas conexões de entrada/saída é intencional**. As construções não atravessam o asfalto. A menor folga de construção ao asfalto principal na matriz foi 30,5 m.
- 14 capturas reais do motor em `visual/pit-*.jpg` e 14 diagramas geométricos em `pit-diagrams/*.svg`. O enquadramento de diagnóstico usa o centro das vagas, sem alterar câmeras de gameplay. `gl.finish()` existe somente no teste de captura, nunca no loop do jogo.

## 5. Desempenho — medição, não promessa

Node 20.20.2 foi usado em **ambos os lados** dos microbenchmarks comparáveis. Instalação/build/testes de publicação foram executados também em Node 24.22.0. Não comparar a duração total de suítes executadas em versões diferentes como ganho de performance.

- Estimador, 6.000 pares de consultas por execução, cinco execuções, média das quatro aquecidas: **310,23 → 45,63 ms (−85,29%)**. Checksum idêntico: `2797844.9691020483`.
- Corrida, seis carros, 6.000 ticks/100 s simulados, quatro execuções, média das três aquecidas: **325,20 → 319,55 ms (−1,74%)**. Progresso, combustível e decisões iguais na amostra. O ganho do microbenchmark não se traduz em ganho de 85% no jogo inteiro.

Navegador: Chromium/SwiftShader, 1280×720, qualidade Custom equivalente Alto, seis carros, chuva/efeitos, arquibancadas completas, sem adaptação automática. Aurora e Neon, sombras 1024 e sombras desligadas **só como cenário de diagnóstico**. Os dois builds foram servidos pelo mesmo `start.py`, em portas distintas. 20 frames de aquecimento + 80 medidos por cenário, seis passos fixos por frame. Não é um teste de tempo real do catch-up do GameLoop. Áudio excluído do benchmark, mas coberto pelos testes funcionais.

**Os resultados finais estão nas tabelas abaixo.** Tempos são intervalos entre frames, não consultas GPU de conclusão. P99 com 80 amostras coincide com o máximo por nearest-rank; não é uma estimativa robusta de sessões longas. Não há ganho consistente de FPS: alguns percentis/cenários pioraram. A renderização por software domina esse cenário; o experimento não demonstra que a causa no computador do usuário é falta de potência.

| Cenário | Média antes/depois (ms) | P95 antes/depois | P99/máximo antes/depois |
|---|---:|---:|---:|
| aurora · sombras 1024 | 388.44 / 385.08 | 480.80 / 474.40 | 525.50 / 526.60 |
| aurora · sombras 0 | 316.67 / 332.41 | 430.80 / 447.60 | 469.40 / 500.50 |
| neon · sombras 1024 | 377.35 / 389.99 | 463.60 / 500.40 | 505.20 / 536.40 |
| neon · sombras 0 | 279.15 / 273.35 | 352.00 / 357.80 | 383.10 / 369.80 |

| Cenário | CPU 6 ticks médio antes/depois (ms) | Submissão render média antes/depois (ms) | Draw calls antes/depois | Triângulos antes/depois | Geometrias antes/depois | Texturas antes/depois |
|---|---:|---:|---:|---:|---:|---:|
| aurora / 1024 | 1.355 / 1.335 | 2.772 / 2.890 | 135 / 135 | 96344 / 95264 | 129 / 129 | 26 / 26 |
| aurora / 0 | 1.246 / 1.467 | 2.100 / 2.331 | 85 / 85 | 81992 / 80912 | 129 / 129 | 26 / 26 |
| neon / 1024 | 1.221 / 1.236 | 2.739 / 2.993 | 144 / 144 | 100910 / 100910 | 127 / 127 | 27 / 27 |
| neon / 0 | 1.164 / 1.085 | 2.211 / 2.028 | 92 / 92 | 86090 / 86090 | 127 / 126 | 25 / 25 |

Carregamento, mesmas quatro navegações novas: até assetsReady, antes **[2939, 3093, 3019, 3129] ms**, depois **[519, 1137, 1955, 739] ms**. Até pelo menos uma submissão de render, antes **[3345, 3529, 3418, 3557] ms**, depois **[797, 2309, 2408, 1064] ms**. São tempos locais, não previsão de download da Vercel nem medição de apresentação física na tela. O sinal ready passou a esperar mais recursos, não a declarar pronto antecipadamente.

Estatísticas de HUD, recomendações, venues, programas/heap e percentis detalhados estão nos JSONs. Não foi medido tempo de conclusão GPU/VRAM, e a hipótese de GC não foi confirmada por trace. Os picos persistentes de render não foram “corrigidos” desligando recursos. Não se mudou qualidade, quantidade de carros, espectadores, áudio ou sombras para obter esses números.

## 6. Testes e validação do pacote

Base v0.8 preservada: SHA256 `ab3737a057d3d3e66eef97e83f721e6e3e7e7c436ef088b3034325620a796174`. Candidato final extraído em pasta independente, sem copiar node_modules nem usar symlinks para a fonte. Instalado/compilado com Node **24.22.0**.

| Comando/verificação | Resultado executado |
|---|---|
| `npm ci` | 21 pacotes; zero vulnerabilidades reportadas pelo npm, não auditoria de segurança completa. |
| `npm run build` (executado por build:playable) | Sucesso, dist estático, 81 módulos. |
| `npm run build:playable` | Build local recompilado, idêntico ao fornecido. |
| `npm run assets:validate` | Sucesso; 15 GLBs, 12 carros e três peças. |
| `npm run audio:validate` | Oito faixas decodificadas, hashes válidos, sem amostras saturadas. |
| `npm test` | **158/158**, 92,87 s na extração final. |
| `GAME_URL=http://localhost:5196 npm run test:browser` | **33/33**, 875,34 s / 14,6 min na extração final. |
| Recursos HTTP da produção | **135/135** arquivos public, com conteúdo/hash correto; sem recursos externos. |
| Manifesto após install/build/testes | **277/277** hashes iguais ao código/build congelado. |

Novos testes: 14 casos por circuito + um caso do cache em Node; quatro casos browser de produção, matriz geométrica/lifecycle, falhas reais de carga e textura pendente/RAF/pausa/saída. Todos os 143 testes Node e 29 browser anteriores foram mantidos. Nenhum teste foi apagado, ignorado ou flexibilizado.

Também foram executados todos os casos de direção manual opcional, planos/ordens em andamento, corrida completa autônoma, campeonato/save/premiação, colisões/filas, SC/clima, cinco regressões de sombras, 14 circuitos, HUD/mobile, carreira/admin, música/mixer/torcida e ciclos de recursos. Console sem erros inesperados; falhas HTTP injetadas são verificadas explicitamente. A tolerância histórica a cancelamento intencional de streams net::ERR_ABORTED continua restrita a esse evento.

Falhas intermediárias foram investigadas: o adiamento da criação de Game foi revertido; a nova fixture que retém uma textura passou a aguardar DOMContentLoaded em vez de aguardar o próprio evento load bloqueado por ela. As asserções foram mantidas. A suíte completa foi novamente executada após a correção final dos prédios urbanos.

Logs atuais: `extracted-install-build-node.txt`, `extracted-audio.txt`, `extracted-browser-final.txt`, `browser-results-extracted.json`, `extracted-validation.json`. Tentativas anteriores permanecem identificadas separadamente; não são o resultado final. A recompilação congelada coincide com a fonte entregue; documentação/evidências finais são acrescentadas sem mudar esse payload.

## 7. Vercel

Framework **Vite**; Node **24.x**; instalação **npm ci**; build **npm run build**; saída **dist**; nenhuma variável de ambiente, API, banco, Python ou rewrite. Publicar a raiz com package.json/src/public, não playable. Instruções completas e lista do conteúdo para GitHub em `VERCEL.md`.

JS final: **925,06 kB bruto / 264,15 kB gzip**; CSS preservado, 91,83 kB / 20,25 kB gzip. O aviso de chunk >500 kB permanece visível, não foi mascarado. Não há necessidade demonstrada de adicionar dependências ou retirar assets. Configuração/caminhos HTTPS são compatíveis por mesma origem; certificado, domínio e dashboard Vercel dependem de publicação real, que **não foi realizada**.

## 8. Pendências e limites — não ocultados

- Não há certificação de GPU/celular/gamepad físico, outros navegadores ou audição humana. FPS/P95/P99 não melhoraram de forma consistente; investigar em hardware do usuário continua necessário. Não prometemos “zero travadinhas”.
- A montagem geométrica inicial de um World ainda contém trabalho síncrono. A espera de I/O e programas de cor é assíncrona; compileAsync não garante eliminar todos os programas de depth/variantes da primeira corrida. Não se transformou o renderer em outro sistema.
- **Artefato em enquadramento diagnóstico elevado de Neon:** ao apontar uma câmera arbitrária para a linha da pista, no SwiftShader, partes da imagem ficaram encobertas por uma região triangular. O mesmo resultado foi reproduzido no ZIP v0.8 original, inclusive sem sombras; raycast CPU encontrou pista/terreno nas posições corretas. A causa não foi estabelecida. Não foi corrigido por apagar geometria, desativar sombras ou aplicar offset por pista. A matriz de capturas foi enquadrada no centro real das vagas para inspeção; isso não altera nenhuma câmera do jogo nem prova resolução desse artefato. Evidências `diagnostic-neon-original.jpg` e `diagnostic-neon-elevated.jpg`. Requer investigação gráfica adicional/hardware real; não confundir com sobreposição geométrica de prédios, esta corrigida e testada.
- O site é preparado para a raiz do domínio. Hospedagem sob subdiretório exigiria adaptar os URLs absolutos de assets; não é a configuração proposta para Vercel.
- Saves continuam locais por origem. Não há backend nem sincronização em nuvem. A mudança de domínio não migra automaticamente o armazenamento.
- Limitações do modelo de corrida da v0.8 continuam: sem ERS, estoque de jogos de pneus ou save no meio da volta. Nenhum desses sistemas foi removido nesta correção.
