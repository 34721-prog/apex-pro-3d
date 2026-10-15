# Catálogo de assets

Lista individual com nome, formato, tamanho e uso: **ASSETS.csv**.

- 12 carros GLB, 12 miniaturas PNG transparentes.
- 31 retratos e 31 capacetes individuais, distribuídos em normal/mythic/legendary/mega.
- 3 módulos GLB iniciais: reta de 30 m, curva de 90 graus e barreira de concreto.
- 8 texturas PNG, ícones SVG, fontes WOFF locais e logo original.

## Convenções 3D

Uma unidade = um metro. +Y para cima, +Z é a frente do carro, +X é o eixo transversal positivo do modelo (a direção humana é convertida para yaw em Controls). Origem do carro no plano central do chassi; os pneus encostam no solo próximo a Y=0. Dimensões típicas: 3,37 × 1,8 × 5,41 m. Rodas são nós articulados `wheel`. Materiais principais: `body`, `accent`, `carbon`, `helmet`.

As superfícies modulares da pista são malhas planas 3D no plano XZ; não são imagens de apresentação. A reta tem origem no centro da borda inicial, largura 16 m e comprimento 30 m. A curva é um arco de 90° com raio central de 40 m, largura 16 m; começa em Z=0. A barreira mede 4 × 1,15 × 0,67 m, com base em Y=0.

Os 14 circuitos completos são gerados do catálogo `src/data/tracks.js`, compartilhado pela geometria, física, bots, checkpoints e minimapa. Os módulos GLB permanecem disponíveis como biblioteca reutilizável, não substituem a lógica desses traçados.

As texturas base asfalto/grama/zebra são integradas ao circuito. Texturas adicionais e ícones individuais são recursos reutilizáveis; nem todos os arquivos opcionais são necessários em cada cena.

## Validação

`node scripts/validate-assets.js` carrega os GLB e registra dimensões, triângulos e contagem de malhas em `tests/asset-validation.json`. Os testes verificam os 31 retratos no navegador e a existência dos demais assets.

## Regeneração

- Texturas: `python scripts/textures.py` (Pillow).
- Pilotos: `python scripts/driver-assets.py` (Pillow e Node).
- GLB: `node scripts/export-assets.js`.
- Miniaturas: com servidor ativo e Chromium Playwright instalado, `node scripts/thumbnails.js`.

Logo é do usuário; não é regenerada. Fontes Barlow e Barlow Condensed: licenças OFL junto aos arquivos. Modelos, texturas e retratos foram produzidos proceduralmente para o projeto.


## Componentes paramétricos novos — 0.3

Os arquivos estáticos do CSV permanecem os mesmos; os componentes seguintes são geometria real instanciada, criada localmente e reutilizável, não imagens nem módulos vazios.

| Componente / fonte | Escala e orientação | Reutilização |
|---|---|---|
| Garagem de equipe · `graphics/PitVisuals.js` | 17 m lateral × 26 m longitudinal, altura 6,85 m; frente aberta voltada para a faixa | seis instâncias configuradas por `strategy/PitLayout.js`; cubos em um pool |
| Vaga / marcações · mesmo módulo | quadro 5,7 × 8,4 m; centro lateral 36 m; +Z na tangente da pista | todas as pistas/equipes |
| Circulação / apron · mesmo módulo | 530 m incluindo extremidades, faixa 9,6 m; ampliação lateral junto às vagas | malha única derivada do layout físico |
| Fachadas / nomes | atlas CanvasTexture local 1024 × 384; seis faixas | material compartilhado, sem requests externos |
| Mecânico low-poly | aproximadamente 1,7 m; seis funções por garagem, +Y vertical | pool instanciado de 36 pessoas; partes dimensionadas a partir de cubo unitário |
| Pneus de serviço | raio 0,56 m, largura 0,4 m, eixo lateral; anéis de composto | cilindros/anéis instanciados, oito pneus por garagem |
| Macaco / armários / bancadas / torre de ar | metros; cubos unitários escalados | mesmo pool do equipamento, sem criação por quadro |
| Chuva / poeira · `graphics/Effects.js` | coordenadas 3D locais à região do carro | buffer limitado a 128 pontos, desligável |

A colisão do separador, paredes e bancada usa as dimensões do layout em `PitLayout.js`. Mecânicos são representação visual sincronizada, não pedestres com física própria. Os carros continuam usando os modelos existentes e hitboxes orientadas existentes.


## Expansão v0.4

- 14 circuitos, oito novos: geometrias em `src/data/tracks.js`; geração, validação e miniaturas em `TrackGeometry.js`.
- Miniaturas SVG geradas a partir da mesma spline, uma por circuito; não há imagem genérica reutilizada como se fossem traçados diferentes.
- Catálogo técnico completo: `CIRCUITOS-v04.csv` (região, categoria, comprimento, largura, curvas aproximadas, noite e semente).
- `TrackAtmosphere.js`: postes/luminárias emissivas instanciados para noite; paletas/rochas/vegetação/neve cenográfica e entardecer. Sem dezenas de luzes dinâmicas pesadas.
- Largura da pista, zebras, barreiras e separador derivados da pista ativa. Elevação física não é suportada: o relevo montanhoso é cenário.
- A distribuição v0.4 mantém os arquivos binários uma única vez em `public/assets`; `start.py` serve-os para a compilação de `playable`.
- Para regenerar PNGs opcionalmente: `python -m pip install -r requirements-assets.txt`. Os assets prontos já estão incluídos; jogar e validar GLBs não requer Pillow.

## v0.5 — Safety Car e competições

- `graphics/SafetyCarModel.js`: cupê original low-poly, aproximadamente 2,95 m de largura visual × 4,94 m de comprimento × 1,76 m de altura. Eixo longitudinal +Z. Hitbox conservadora compartilhada 3,38 × 5,46 m.
- Rodas cilíndricas com geometria compartilhada, materiais reutilizados, faróis/lanternas básicos, faixas âmbar, giroflex e placa CanvasTexture local. Nenhuma luz dinâmica adicional pesada. Um modelo por World, transformado a cada render e descartado com o cenário.
- Monogramas AWC/SPR/JNR/END/ONE/LEG/TA e paletas próprios em CSS, sem marcas reais. Os carros das competições usam as formas originais existentes, com pinturas/números individuais e especificações de categoria; não fingem ser GT.
- `renderer.js`: deformação leve da asa dianteira proporcional ao dano medido; sem novas peças sólidas/destroços ou criação contínua de meshes.


## v0.7 — público, ambientes de evento e áudio original

- `venue/VenueLayout.js`: dez footprints por pista, validados contra toda a spline, corredor dos boxes/paddock, água costeira e outras arquibancadas.
- `venue/VenueVisuals.js`: terraços, suportes, coberturas, bandeiras, sinalização de setores e faixas emissivas; atlas local de 32 silhuetas/poses em 512 × 256, instancing e animação coletiva no shader. LOD de duas placas cruzadas para uma, sem retirar pessoas. Quatro telões usam uma textura 512 × 256 atualizada com dados reais.
- `tracks/textures/terrain-neutral.png`: grão original neutro, para areia/neve não herdarem o verde da textura de grama.
- `audio/`: seis composições instrumentais MP3, duas camadas sintéticas de torcida, `manifest.json` e `LICENSE-AUDIO.txt`. Sem gravações, samples ou músicas comerciais. Permissão livre inclusive para uso comercial, modificação e redistribuição, conforme o texto incluído.
- Créditos: composição e desenho sonoro procedural do projeto Apex Dynasty; receita `scripts/compose-audio.py`, semente 7307. NumPy e FFmpeg/libmp3lame são ferramentas opcionais de construção, não bibliotecas carregadas no jogo nem binários redistribuídos.
- `src/audio/Tracks.js` registra arquivos e metadados reais gerados pela receita. MP3s locais são reproduzidos sob demanda por dois decks HTMLAudio; somente os dois clipes curtos de torcida são decodificados para Web Audio.
