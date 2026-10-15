# Apex Dynasty v0.7.1 — correção técnica das sombras

## Diagnóstico e correções

A v0.7 usa **sombras reais PCFShadowMap de uma luz direcional**. Não havia uma elipse ou sprite independente para reposicionar. A profundidade do mapa é gerada a partir das próprias malhas dos carros.

**Causa principal reproduzida:** `shadowMap.autoUpdate=false`, combinado com um timer de `0,1 s` no Médio e `0,05 s` no Alto. Os carros avançavam em cada render, mas o asfalto recebia a sombra de uma pose anterior. Com passos de 1/60 s, o arredondamento prolongava alguns intervalos até 7/4 quadros. O probe anterior registrou atualizações em apenas 1/12 e 3/12 quadros observados. Depois da correção: **12/12 nos dois presets**, com os seis carros participando dos passes.

Outros pontos tratados separadamente:

- **Cobertura:** o mapa deixava de considerar carros visíveis longe do jogador e câmeras de boxes/Safety Car. Agora cobre uma região em torno do alvo efetivo da câmera e os veículos visíveis, com margem para a geometria e a projeção. O depth range também é ajustado para não cortar esses emissores.
- **Estabilidade:** o centro da projeção é alinhado a texels no espaço da luz. A direção solar permanece constante no mundo, mesmo com rotação/zoom da câmera. A área cresce em blocos, sem encolher a cada saída de um carro do enquadramento; reinicia ao trocar sessão/modo/qualidade. Isso elimina o reposicionamento subtexel arbitrário, não promete resolução infinita.
- **Identidade:** modelos usam `carById`, não a posição de `drivers[i]`. Reordenar carros não transfere a malha/sombra para outro piloto. Um ID ausente fica invisível e não participa da próxima geração do mapa. Um carro retirado que continua sendo um obstáculo físico permanece corretamente visível e sombreado — isso não é uma sombra órfã.
- **Safety Car:** não tinha meshes emissores habilitados. Passa a projetar sombra real no mesmo mapa. Suas partes sólidas foram agrupadas uma única vez por material; giroflex e placa permanecem separados, sem criar peças a cada quadro.
- **Contato:** normalBias reduzido de 8 cm para 2 cm, com pequeno bias de profundidade. Não há offsets X/Z por pista ou modelo. O mapa recebe a altura real da malha, inclusive o levantamento visual no macaco; projeta sobre os meshes reais do asfalto, piso dos boxes, chão e estruturas, e não sobre um plano falso atravessando tudo.
- **Posse:** descarte explícito do LightShadow ao liberar o World; troca de resolução usa seu lifecycle. A dependência Three já libera a depthTexture junto ao render target, portanto não se afirma um vazamento anterior dessa textura que não foi demonstrado.

Foram descartadas como causas: conversão para coordenadas de tela, posição inicial independente da sombra, interpolação própria da sombra, batching de carros no cenário e falta de atualização da projectionMatrix na primeira criação do render target (Three já a fazia). A auditoria detalhada e o adendo sobre a dependência estão em `AUDITORIA-SOMBRAS.md`.

## Ordem do quadro e desempenho estrutural

1. `Game.frame` avança a física fixa existente.
2. `World.render` aplica posição/rotação/altura e rodas às malhas por ID; ausentes ficam invisíveis.
3. Atualiza Safety Car, mecânicos/instâncias e demais visuais.
4. `DynamicShadows.update` ajusta cobertura e grade da luz para esse enquadramento.
5. Um único `renderer.render` atualiza matrizes e produz profundidade e cor da **mesma pose**.

Sem RAF adicional, timer por sombra, sprite de contato, raycast por pneu, cache de posição anterior ou novas fontes de luz. É mantido um único mapa PCF existente, com 512/1024 conforme a configuração. Vetores/frustum/matrizes auxiliares são reutilizados. Física, colisões, IA, carros/bots, pistas e áudio não são alterados para melhorar os números.

O modo Baixo e a opção explícita Sombras=0 já desligavam sombras na v0.7 e continuam disponíveis. **Não foram usados como solução**: todos os testes corretivos de sombra usam Médio/Alto com sombras habilitadas.

## Testes executados na fonte

- 129 testes Node aprovados: 125 regressões mais quatro testes de projeção, grade, cobertura/histerese, opções e descarte.
- Cinco testes específicos Chromium aprovados, com snapshots/matrizes e imagens reais. A versão final desses testes também exige que a posição mundial de cada modelo coincida com o estado físico atual; a aprovação integral da cópia extraída está em `VALIDACAO-SOMBRAS.md`.
- `onBeforeShadow` e `onBeforeRender` comparam as 16 componentes de cada matriz das malhas visíveis. Verificam profundidade atual, não apenas compilação ou existência de objetos.
- 144 quadros de movimento controlado (seis condições × 12 quadros × Médio/Alto), nove câmeras, grid de seis carros, reordenação/remoção de IDs, `dt=0`, reinícios e 14 pistas, retornando a Aurora.
- Entrada, serviço, elevação no macaco, liberação e saída/merge percorridos pela física/boxes existentes. Os testes não reposicionam o carro na vaga para fingir um serviço.
- Colisão física controlada produziu três registros de impacto; malhas e sombras continuaram atualizadas após a resposta do sistema.
- Rodada usa também um fixture angular controlado, para exercitar orientações extremas sem depender de sorte na IA. Não é uma alegação de nova física de derrapagem.

### Inspeção visual solicitada

Capturas em `tests/performance/shadows/visual/`: parado, aceleração, frenagem, curvas nos dois sentidos, rodada, lado a lado/grid, colisão, entrada/serviço/saída de boxes, câmeras chase/far/cockpit/broadcast/boxes/Safety Car/arquibancadas e pistas diurna/noturna/neve/deserto/costa. As folhas `inspection-*` reúnem amostras; os registros individuais verificam todas as 14 pistas e o reinício. Sombras próximas aos carros nas capturas, sem o rastro antigo observado no baseline.

### Teste de pixels da GPU

O teste adicional suprime **apenas no harness** a escrita de cor/profundidade dos materiais visíveis do carro, sem suprimir sua emissão no shadow pass. Isso permite medir a sombra inteira sem a carroceria ocultar partes diferentes dela conforme a perspectiva. Compara o receiver real com/sem esse emissor; a aplicação não usa essa técnica como representação de sombra.

Deslocamento lateral de 2 m: erro de acompanhamento do centroide da sombra reconstituído no plano da pista **1.65 cm** neste fixture, abaixo da tolerância de rasterização de 12 cm. Após remover o emissor, **0 pixels residuais** acima do limiar entre o quadro vazio anterior e posterior. Veja `gpu-pixels.json` e `pixels-*.png`.

## Comparação de custo — sem inventar FPS de hardware

Benchmark real antes/depois: três execuções, mesma cena/pose, seis carros, Alto, 1280×720, 8 s, descartando cinco primeiros frames. Chromium com **SwiftShader por software**.

| Métrica média | v0.7 | v0.7.1 |
|---|---:|---:|
| Frame (ms) | 278.25 | 287.62 |
| FPS | 3.594 | 3.478 |
| Submissão JS (ms) | 1.825 | 1.738 |
| Draw calls | 131 | 131 |
| Triângulos | 93808 | 93808 |
| Geometrias | 103 | 103 |
| Texturas | 18 | 18 |
| Carregamento (ms) | 3003.7 | 3048.3 |

Nesse renderer lento, a v0.7 já atualizava o mapa a cada frame porque o intervalo real era maior que o throttle. Esse benchmark sozinho **não** mede o custo adicional em uma máquina de 60 FPS.

Por isso também foi executada uma cadência artificial de 1/60 s, com carros movidos no fixture, 40 renders e 30 amostras após aquecimento. Os tempos abaixo são **submissão JavaScript/chamadas GL**, não tempo certificado de GPU nem FPS (o navegador pode enfileirar comandos mesmo com gl.finish).

| Versão / qualidade | Passes de sombra / 30 | Draw calls médios | Submissão (ms) |
|---|---:|---:|---:|
| before / medium | 4 | 142.2 | 1.337 |
| before / high | 7 | 151.2 | 1.857 |
| after / medium | 30 | 182.2 | 1.570 |
| after / high | 30 | 185.2 | 2.030 |

Há custo real para deixar de reutilizar profundidade desatualizada: o depth pass agora acompanha todos os quadros. Não houve multiplicação de mapas/luzes, remoção de bots ou redução da qualidade para disfarçar esse custo. Contagens de chamadas variam com os emissores visíveis e o agrupamento do Safety Car. Dados brutos e scripts acompanham o pacote.

## Limites e preservação

A correção elimina a defasagem temporal reproduzida e os vínculos/recortes abordados nos testes. Não há certificação de zero aliasing em qualquer hardware: shadow maps finitos ainda têm bordas filtradas e perdem detalhe em enquadramentos muito amplos. A expansão de cobertura prioriza não cortar os veículos visíveis; não implementa cascaded shadow maps. Não houve teste em GPU física, Safari/Firefox ou celular físico, nem promessa de 60 FPS.

O circuito físico continua plano; elevações montanhosas são cenário. Receivers 3D existentes continuam recebendo projeção real, mas esta versão não adiciona simulação de suspensão ou pistas com altimetria.

Mantidos os 31 pilotos, 12 carros, 14 pistas, arquibancadas/torcida/música v0.7, regulamentos/SC, clima, campeonatos, carreira/saves e laboratório local. Registros da validação extraída são a fonte final de aprovação.

## Executar

Extraia `Apex-Dynasty-v0.7.1-Sombras-Corrigidas.zip`, entre em `Apex-Dynasty-v0.7.1` e execute `python start.py`. Abra http://localhost:8080. Fonte e assets locais completos, build em `playable`, dependências exatas no lockfile e receitas/testes/documentação incluídos. Não execute por file://.
