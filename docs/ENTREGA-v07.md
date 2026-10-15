# Entrega v0.7 — Arquibancadas e Áudio

Continuação direta da v0.5. Não substitui o jogo nem a geometria dos circuitos.
A auditoria anterior às alterações está em `AUDITORIA-v07.md`.

## Implementado

- 140 arquibancadas distribuídas: dez por pista, com duas grandes áreas na reta principal e outras ao longo de retas/curvas nos três setores. Terraços de 6–10 fileiras, coberturas e suportes 3D; nada de milhares de personagens complexos.
- Atlas original de 32 silhuetas (roupa, pele, bonés, braços erguidos e postura sentada/em pé), instancing e movimento coletivo no vertex shader. As pessoas mantêm seu lugar; não há simulação individual de multidão.
- LOD troca duas placas cruzadas por uma placa, sem alterar a contagem de público. Baixo/Médio/Alto mantêm os mesmos assentos preenchidos. Animação distante reduzida, culling por arquibancada, nenhum update CPU por pessoa.
- Bandeiras animadas, placas de setor, pórtico dimensionado pela largura real da pista, paddock/boxes preservados. Identidade Apex nas placas; tons de deserto/neve usam grão neutro em vez de grama verde. Estruturas urbanas menores, coberturas costeiras/desérticas e paletas de bosque/montanha/boreal; noite usa faixas emissivas, não dezenas de novas luzes.
- Quatro telões por circuito compartilham CanvasTexture a 1 Hz: top 4 real, intervalos quando existem, melhor volta em sessões cronometradas, tempos finais com penalidades e estado/relógio. Sem sessão: boas-vindas. Sem dados de intervalo: “—”.
- Tour de dez arquibancadas em Circuitos e câmera opcional no HUD. Correção para que a seleção dessa câmera não interrompa a atualização visual dos carros.
- Observador de apresentação lê eventos e ordem física sem alterar corrida/RNG: largada, ultrapassagem próxima efetivamente observada, chegada do jogador e vitória real. Animação local e comemoração sonora limitada; não se inventam resultados ou anúncios de vitória.

## Segurança geométrica e circuitos

Footprints orientados incluem margens de cobertura. Planner examina os 1.920 pontos da spline ativa, corredor físico dos boxes e faixa do paddock até 112 m laterais, outras arquibancadas e limite da água costeira. Árvores/prédios/placas/postes de iluminação evitam essas áreas. Testes também verificam os vértices efetivamente construídos dentro do footprint e a base junto ao solo plano (−0,06 m).

As distâncias abaixo são da **linha central à borda do footprint**, não à borda do asfalto; a largura varia de 14 a 22 m. Os valores completos e setores estão em `venue-clearance.json`.

| Circuito | Arquibancadas | Espectadores | Menor distância à linha central |
|---|---:|---:|---:|
| Circuito Aurora | 10 | 5,719 | 24.9 m |
| Veloce Highlands | 10 | 5,719 | 27.2 m |
| Serpente Valley | 10 | 6,464 | 19.7 m |
| Porto Neon | 10 | 3,760 | 23.2 m |
| Titan Ring | 10 | 6,464 | 28.4 m |
| Costa do Vento | 10 | 5,719 | 29.1 m |
| Sahara Speedway | 10 | 6,464 | 21.0 m |
| Alpine Crown | 10 | 5,719 | 22.2 m |
| Emerald Forest Ring | 10 | 5,719 | 18.6 m |
| Old Town Grand Prix | 10 | 3,760 | 21.5 m |
| Sunset International | 10 | 5,719 | 19.2 m |
| Nordic Storm Circuit | 10 | 5,719 | 27.3 m |
| Desert Night Run | 10 | 6,464 | 19.2 m |
| Discovery Circuit (semente 4107) | 10 | 5,719 | 24.7 m |

## Música e mixer

Áudio criado por síntese matemática original, sem copiar gravações, canções ou samples comerciais. MP3s reais, comprimidos, prontos para uso. Receita e semente incluídas; licença permissiva em `public/assets/audio/LICENSE-AUDIO.txt`. A torcida é sintética e estilizada, não gravação de espectadores humanos.

| Cue | Contexto | Duração | BPM |
|---|---|---:|---:|
| Gridline / tema Apex | menu | 64.00 s | 120 |
| Garage Pulse | selection | 51.43 s | 112 |
| Five Lights | grid | 15.00 s | 128 |
| Slipstream | race | 60.00 s | 128 |
| Champions Avenue | victory | 32.00 s | 120 |
| Season Horizon | championship | 51.43 s | 112 |

Torcida: cama ambiental de 17,3 s e comemoração de 4,6 s, com variações de playback rate. Dois loops representam apenas as arquibancadas mais próximas, com panorama pela direção do carro e volume por distância/velocidade; além de 230 m a cama é silenciada. Uma única comemoração pode tocar simultaneamente, atenuada por distância; cooldown normal de 8 s e janela de chegada/vitória de 3 s. Evento prioritário pode elevar o clipe já tocando, sem empilhar fontes. Cauda de resultados limitada a 5 s, cama silenciada nessa tela.

Um AudioContext, master e compressor de saída; buses independentes para motor, efeitos, música e torcida. Voz local nativa recebe volume de voz × master, cancela ao mutar/alterar volume e preserva texto quando não há voz PT instalada. Nenhuma síntese remota de fala.

Música: dois HTMLAudio reutilizados, um stream em regime estável e no máximo dois durante crossfade de 0,8 s. Trocas rápidas guardam o último destino; rerender da UI não reinicia a faixa. Não há cache Web Audio das seis músicas. Só os dois clipes de torcida são decodificados sob demanda (aproximadamente 3,9–4,2 MB a 44,1/48 kHz), reutilizados entre provas. Nenhum áudio de outra pista é carregado como um pacote separado.

Configurações persistentes: som geral, volume geral/música/motor/torcida/efeitos/voz, música ativada, música de corrida opcional e redução a 25% durante corrida. Música de corrida desligada por padrão. Autoplay depende de gesto. Pausa/vermelha suspendem reprodução; aba oculta também suspende o contexto, e sair elimina fontes da prova. O compositor/FFmpeg/NumPy não são necessários em runtime.

## Preservação e validação

Mantidos 31 pilotos, 12 carros, 14 pistas, direção de prova, SC/VSC, clima, falhas opcionais, classificações/sessões, sete competições, campeonato legado, IA/física fixa, colisões e boxes, carreira, saves aditivos e admin local isolado. O grid máximo existente continua com seis carros; não foram removidos bots para melhorar métricas.

- 125 testes Node aprovados na fonte: inclui as 106 regressões anteriores e 19 verificações novas.
- 20 cenários Chromium exercitados. A primeira passagem teve 19 aprovados e uma asserção antiga que tratava o cancelamento de um MP3 ao recarregar como asset faltante. O harness agora separa **somente** `media + net::ERR_ABORTED`, registra o cancelamento e continua falhando em 4xx/5xx e demais erros. As seis regressões afetadas passaram novamente. Não foi silenciada nenhuma exceção da aplicação. A execução integral final da cópia extraída passou em **20/20**, sem falhas, skips ou retries; veja `VALIDACAO-PACOTE-v07.md`.
- Verificação de lotação idêntica em três qualidades, movimento dos carros na câmera de arquibancadas, placar versus ordem real, footprint/solo em 14 pistas e retorno a Aurora com contagens de recursos não crescentes.
- 42 capturas: três áreas por pista, com inspeção visual. JPEGs e dados em `tests/performance/v07/visual/` e `venue-inspection.json`.
- Reprodução dos seis cues, sinal não nulo medido por AnalyserNode, independência música/motor, master, três outros buses, pausa/aba oculta, sem reinício por rerender, repetição de provas e fontes limitadas. Voz testada com interface local controlada; não havia uma audição humana.
- Os oito MP3s foram realmente decodificados por FFmpeg: duração, RMS, pico e hash verificados; zero amostras saturadas. Isso não substitui julgamento acústico subjetivo.
- Suites anteriores continuam exercitando teclado/toque, HUD em seis resoluções, save corrompido, admin, contratos, boxes/câmeras, corridas nas 14 pistas e temporadas com sessões físicas. Sem skips ou resultados de corrida inventados.

## Comparação medida

Mesmo Chromium/SwiftShader, 1280 × 720, preset Alto, seis carros, mesma pose física e câmera; três execuções de render de 8 s por versão, excluindo cinco primeiros frames. Baseline v0.5 medido antes das mudanças; v0.7 com build de produção. Áudio desligado para comparar render. Média das execuções:

| Métrica | Antes (v0.5) | Depois (v0.7) |
|---|---:|---:|
| Frame (ms) | 243.90 | 284.11 |
| FPS | 4.10 | 3.52 |
| Draw calls | 125 | 131 |
| Triângulos | 88,860 | 93,808 |
| Geometrias registradas | 93 | 103 |
| Texturas registradas | 14 | 18 |
| Heap JS amostrado (bytes) | 17,190,319 | 12,090,828 |
| Carregamento (ms) | 2,716.3 | 3,036.7 |
| CPU para 100 s simulados / quente (ms) | 282.07 | 245.63 |

A ampliação tem custo: +4,8% de draw calls e +5,6% de triângulos nesta cena. O FPS por software caiu aproximadamente 14,2%; não há alegação de custo zero. A queda de heap e a variação do microbenchmark CPU não provam otimização: são amostras sujeitas a GC/agendamento e o núcleo físico não foi alterado para isso. Contagens de recursos não equivalem a certificação de ausência de vazamento de heap/VRAM.

## Limites honestos

Estética low-poly com pessoas em placas/sprites, não personagens volumétricos individuais. Coberturas/suportes e arquibancadas são geometria 3D. Terreno físico continua plano; montanhas são cenário. Reações são do público próximo ao jogador, não de cada espectador/bot; não há acústica por oclusão/reverberação do estádio, fala da torcida ou gravação humana. Música instrumental curta, em loops compostos de 15–64 s, sem canções vocais. Resultados usam o pódio/relatório existente, sem nova cerimônia 3D.

Validado em Chromium com SwiftShader e saída física de áudio silenciada pelo runner, mas com grafo/sinal Web Audio medidos. Não houve teste em GPU real, celular físico, Safari/Firefox, gamepad físico ou audição humana. Não se promete 60 FPS, ausência absoluta de vazamentos ou certificação jurídica universal. As licenças/receitas dos assets acompanham o produto.

## Rodar e localizar

Extraia o ZIP, entre em `Apex-Dynasty-v0.7` e execute `python start.py`; abra http://localhost:8080. Fonte: `src/`; build: `playable/`; assets únicos: `public/assets/`; testes: `tests/`; dependências exatas: `package-lock.json`; receitas e empacotamento: `scripts/`. Para desenvolver: `npm ci`, `npm run dev`. Para atualizar build compartilhado: `npm run build:playable`.
