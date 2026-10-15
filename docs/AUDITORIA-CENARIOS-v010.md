# Auditoria prévia — ambiente v0.10 (trabalho em andamento)

## Integridade e arquitetura
Antes de qualquer alteração do jogo: 285/285 hashes do manifesto v0.9 iguais; não há `.git`. ZIP v0.9 protegido, SHA256 d373b2727cfe5ef14707cb21fcbc912b85053a913d450169683103e56c1f529c. Nenhuma diferença de código preexistente detectada. A instalação de ferramentas não é uma alteração de gameplay.

Entrada `src/main.js` → `src/core/Game.js`, `GameLoop.js`: RAF único, simulação fixa 60 Hz. Vite, Three local, distribuição estática `playable`, servidor opcional `start.py`, configurações Vercel existentes. Não há motivo identificado para migração ou dependência adicional.

Geometria autoritativa: `track.js`, catálogo de 14 circuitos fictícios em `data/tracks.js`. Simulação/câmeras/apresentação separadas; `VehicleMotion.js` e `VehiclePresentation.js` já contêm os ajustes v0.9. Boxes físicos em `strategy/PitLayout.js`, visuais em `graphics/PitVisuals.js`. Público/arquibancadas em `venue/`. Sombras correntes em `DynamicShadows.js`. Clima real em `events/Weather.js`, efeitos leves em `Effects.js`. `optimize.js` agrupa estáticos; descarte de recursos pertence a World.

## Evidência inicial
`scripts/inspect-environment.js before`: produção v0.9 extraída, Python 5200, Chromium/SwiftShader, 1280×720, Medium, seis carros autônomos, 600 ticks, overview/broadcast/chase/pit-garage em TODOS os 14 circuitos. 56 capturas e JSON em `tests/performance/environment/`. Captura automatizada não significa inspeção humana de cada imagem.
Imagens efetivamente examinadas inicialmente: Aurora overview/broadcast/pit-garage, Neon overview, Emerald broadcast, Sahara chase.

| Prioridade | Situação | Evidência / causa | Risco e verificação |
|---|---|---|---|
| Alto | Confirmado | Overview quase apagado e parte distante ausente. `Quality.js`/`renderer.js`: far e fog.far 1440 em Medium também na câmera aérea; Aurora fica a ~1260 m do alvo. | Corrigir planos pelo enquadramento, separar névoa de clipping; testar aéreas e retorno a cockpit/boxes. |
| Alto | Confirmado | Grandes áreas planas sem composição em Aurora/Emerald; horizonte quase vazio em Sahara. `renderer.js`: plano 4200², apenas 130 árvores em anel exterior e 22 cones isolados. | Composição em camadas; manter pista, limites, áreas de segurança e boxes intocados. |
| Médio | Confirmado por código | Base dos troncos varia indevidamente: centro Y=2 constante, altura=4*escala. Escala .7 deixa base Y=.6 versus terreno -.06. | Novo modelo com origem na base e instâncias apoiadas no mesmo terreno plano. |
| Médio | Confirmado por código | 19 anúncios recriam quatro texturas/materializações equivalentes; agrupamento depende de identidade do material. | Compartilhar quatro materiais/texturas, preservar mensagens e posições, medir recursos. |
| Médio | Confirmado | Infraestrutura NÃO está ausente: dez arquibancadas, milhares de pessoas, boxes/equipamentos/torre/paddock existem. Isolamento espacial causa aparência incompleta. | Integrar instalações auxiliares e vegetação, não duplicar boxes nem público. |
| Médio | Não diagnosticado | Faixas triangulares claras no piso de Aurora/pit-garage. Há também limitação histórica Neon. | Não atribuir causa sem teste isolado; manter pendência se não reproduzida/solucionada. |
| Baixo | Hipótese | Novas instâncias podem aumentar GPU/draw calls. Não há gargalo novo medido ainda. | Comparação de produção equivalente, grupos espaciais, recursos compartilhados, sem retirar bots/público. |
| — | Sem novo defeito confirmado | Movimento v0.9 não deve ser reconstruído por presunção. | Reexecutar regressões e conservar limites explicitados na matriz anterior. |

## Plano autorizado pelo pedido
1. Completar referência quantitativa antes das alterações.
2. Substituir anel genérico/cones por composição determinística com perfis próprios dos 14 circuitos, vegetação/rochas em agrupamentos seguros, instalações auxiliares e terreno distante 3D contínuo. Não alterar geometria dirigível.
3. Reutilizar geometria/materiais, agrupar espacialmente e preservar ciclo de descarte. Melhorar variação do solo e filtragem, sem rede/CDN.
4. Ajustar alcance/névoa da câmera ao enquadramento, mantendo a arquitetura de luz/sombra, competição e câmeras independentes.
5. Regressões Node/browser, capturas reais antes/depois, medições equivalentes, relatório com pendências explícitas. Clima, pits e movimento existentes não serão anunciados como funcionalidades novas.

Status desta nota: auditoria inicial, não relatório de conclusão.
