# Apex Dynasty v0.8 — Manager e Estratégia

## O conceito principal foi corrigido

O jogador é chefe de equipe. `Game.start` delega a pilotagem por padrão inclusive na corrida rápida, no campeonato legado e nos saves anteriores. As sete competições já possuíam lançamentos delegados e permanecem compatíveis. Manual é uma escolha separada/voluntária, não consequência de trocar a câmera ou modalidade.

A v0.8 continua a v0.7.1. Não cria um segundo simulador: ordens e o diretor estratégico alimentam os inputs do bot existente; `Race.step` mantém a física fixa, colisões, regras, checkpoint, boxes e resultados reais. O grid normal permanece em seis carros/três equipes com duas vagas. Solo/Time Attack e o confronto Mega conservam seus formatos; o rival Mega não vira companheiro comandável.

## Funcionalidades implementadas

### Preparação individual

Página **Estratégia** e planos na preparação de corrida:
- composto de largada; janelas início/fim por parada; composto por stint;
- até seis paradas (limitadas a voltas disponíveis, sem duplicar uma mesma volta inicial);
- quatro ritmos: conservar, equilibrado, agressivo, ataque máximo;
- ultrapassagens/defesa, segurança, rival específico a evitar;
- pneus normal/prolongar stint/resfriar se temperatura alta;
- combustível normal/conservar quando há consumo realista;
- configuração equilibrada, mais apoio ou menor arrasto, com contrapartidas reais em grip/handling/máxima. Não é um botão de potência gratuito;
- assistência automática ou recomendações sem execução automática, política para chuva e SC/VSC;
- objetivo pilotos/construtores/ambos, prioridade individual e ordens entre companheiros.

Planos são independentes. Comandos do chefe não modificam planos, pedais ou restrições dos adversários. A atribuição é por ID/equipe, e não por ordem na classificação. O companheiro recebe a base do carro/desenvolvimento da equipe sem reaplicar duas vezes os bônus do piloto principal.

**Referência pré-corrida:** a estimativa na preparação usa o circuito e carro atualmente selecionados. Os planos são reutilizáveis entre sessões e limitados à duração real ao lançar um campeonato; a página não afirma prever uma próxima pista ainda não carregada ou outra especificação homologada. Revise os planos entre etapas. Configuração/composto inicial ficam bloqueados após lançar a sessão.

### Ordens com efeitos físicos

As políticas mudam alvos de velocidade, limiares de tentativa/defesa e pedal. Não alteram a posição ou os limites físicos para ganhar uma disputa. Ritmo/pedal convergem com constante de 4 s. Ataque máximo dura 30 s; só pode ser reativado após 60 s do início da janela. Freios, aderência, tráfego e bandeiras continuam impondo limites.

Conservar pneus reduz esforço; resfriamento reduz o alvo quando a temperatura passa de 100 °C. A temperatura não é simplesmente fixada num valor ideal. Consumo/desgaste/temperatura/grip são consequências do modelo existente de distância, throttle, velocidade, slip e superfície — não há penalidade de dano sorteada só por clicar em atacar. Maior esforço pode gastar mais recursos ou diminuir margem; não garante uma falha nem uma vitória.

Evitar rival/proteger companheiro atua na seleção efetiva de manobra. Uma intenção já proibida é retirada no próximo ponto seguro, sem salto lateral; carros lado a lado não atravessam a faixa ocupada. A ordem de ceder respeita neutralizações. Objetivo de pilotos começa priorizando a maior pontuação pública dos dois; o chefe pode escolher outro piloto. Construtores evita riscos internos. Disputa livre permanece opcional.

### Pneus e pit stops

Mantidos quatro compostos, saúde, temperatura e grip; acrescentados distância por jogo e histórico de stints. Desgaste reduz grip e o alvo de curva dos bots. Trocas continuam ocorrendo durante serviço físico, nunca ao selecionar o composto na interface.

A central permite BOX AGORA, próximo composto, cancelar, adiar uma volta, mudar janelas/estratégia futura e aceitar a recomendação. O compromisso é a autorização de aproximação/entrada do pit lane: depois disso não se cancela a parada nem troca o composto de serviço pela central. A programação antiga não religa um pedido cancelado no mesmo instante. Um adiamento segura a decisão até a próxima volta.

Reserva/ordem física de chegada, vaga da equipe, fila, limite de velocidade, mecânicos, macaco, abastecimento/reparo, serviço e merge são os já implementados. O diretor evita empilhar companheiros quando existe margem; emergências e fechamento da janela ainda podem gerar fila e perda de tempo. Não há parada instantânea nem teletransporte.

### Deliberação estratégica e rivais

O diretor delibera a **1 Hz simulado**, dentro da autoridade da corrida. Usa pneus e recursos próprios, danos, penalidades, posição/progresso, gaps aproximados, última volta, ocupação de boxes, perda de pit, tráfego projetado e chuva/neutralização atuais.

- **Undercut:** requer horizonte de parada próximo, pneus degradados, rival próximo e ganho de pneu estimado superior ao gap. É apresentado como condicional à futura parada do rival, nunca ganho garantido.
- **Overcut:** rival realmente nos boxes, pneus próprios ainda úteis e última volta mais rápida; pode adiar uma parada prevista por uma volta dentro da janela. Não é apenas um rótulo no HUD.
- **SC/VSC:** oportunidade somente com necessidade de troca/janela e redução mensurável da perda relativa estimada.
- **Chuva/secagem:** reavalia composto pela umidade observada; pode agir ou aguardar autorização.
- **Tráfego:** projeta reentrada usando posições/ritmo atuais; alerta sobre carros próximos, sem conhecer suas posições futuras.
- **Danos/combustível/penalidade:** sugestões executáveis pelo serviço existente.

Rivais têm identidades e planos próprios; compostos, limiares de desgaste/chuva, ritmo e janelas podem divergir entre os carros. O catálogo contém seis perfis, enquanto a grade normal usa três equipes reais (IDs 0/2/4, com a equipe controlada definida pela carreira), não seis equipes simultâneas. A pontuação pública também pode tornar um rival líder mais conservador ou um perseguidor mais agressivo.

A IA estratégica não consulta a seed/próxima fase do clima nem os planos futuros dos adversários. A antiga previsão textual simplificada do clima continua no jogo; o novo diretor usa apenas condições observadas. Recomendações são heurísticas locais, não um otimizador global/MCTS ou reprodução de engenharia profissional.

### HUD e acompanhamento

Central ao vivo, dois resumos de equipe, ordens por carro, pneus/temperatura/km, combustível, paradas/estado, recomendações, decisões e identidades rivais. A classificação, mapa, telemetria, bandeiras, clima e penalidades anteriores permanecem.

O seletor acompanha qualquer carro; câmeras de perseguição, cockpit, transmissão, boxes, Safety Car e arquibancadas continuam, com novas vistas de **circuito completo** e **disputa próxima**. A posição de cockpit acompanha o veículo atual sem o atraso de translação que colocava a câmera atrás do carro móvel; altura visual do serviço também é considerada. Sombras continuam atualizadas com a pose do mesmo quadro.

A central e o diário estratégico/regulamentar do gerenciamento não pausam a prova. Pausa voluntária, blur/aba oculta continuam interrompendo-a por segurança. Não é simulação offline. No celular, a central é um painel rolável/recolhível; feche-a para uma visão desobstruída da pista e classificação. Não se afirma mostrar todas as informações simultaneamente numa tela estreita.

### Carreira, temporadas e histórico

Contratos, treinamento, desenvolvimento, créditos, XP, desbloqueios, rivalidades e campeonatos existentes são preservados. Treinamento de consistência é aplicado aos dois pilotos da equipe. A classificação de pilotos/construtores continua derivada dos resultados reais; não foram criadas rivalidades/posições artificiais para gerar eventos.

**Plano × execução** compara composto/plano original com paradas reais, stints e decisões. Até 12 relatórios completos recentes, com até 120 decisões por relatório; temporadas guardam resumo de até 40 decisões estratégicas por sessão, além dos registros anteriores. Saves validam IDs, valores, campos e tamanhos. A migração é aditiva; a estratégia global antiga vira planos da equipe, não comandos aos rivais.

Persistência é de sessões **concluídas** e da posição na temporada. Não há save/resume no meio de uma volta. Recompensas continuam seguindo as regras existentes, sem duplicação ao reabrir relatório.

## Estimativas: método e limites

`StrategyEstimator` amostra 96 segmentos de curvatura, usa velocidades de curva derivadas de grip/clima/piloto/dificuldade, limita aceleração e frenagem e integra tempo por distância. Considera composto/desgaste projetado por stint e serviço. A perda de boxes amostra 64 segmentos da trajetória real do pit lane, inclui acesso à vaga, limite, frenagem e serviço estimado. A última volta disponível calibra de forma limitada a referência.

Os números são **modelos aproximados em ar livre**, marcados com “~”; não são tempos sorteados, previsão garantida ou intervalo estatístico inventado. O plano supõe clima atual e parada no início da janela. Congestionamento, fila da equipe, SC futuro, incidente, pilotagem e escolhas dos rivais alteram a execução. Ainda falta calibração estatística em muitas condições. A recomendação ao vivo se atualiza a 1 Hz; a tabela de comparação do plano é recalculada ao abrir/editar a central, não promete previsão exata quadro a quadro.

Arcade conserva combustível assistido/desgaste reduzido; Realista é necessário para a gestão completa de consumo. Não há ERS, estoque limitado de jogos de pneus, aquaplanagem espacial ou novas pistas com altimetria. Esses controles não foram simulados por texto decorativo.

## Validação

Auditoria e benchmark anteriores às alterações: `AUDITORIA-v08.md`, `tests/performance/v08/before-*`.

14 testes Node novos cobrem migração/validação, ordens individuais e graduais, ataque limitado, comportamento físico, cancelamento/compromisso, estimativas/SC, ausência de consulta ao clima futuro, corridas completas seca/chuva, troca manual/IA, prioridade por pontos, temporada completa, seleção de manobras, undercut/overcut e isolamento dos rivais. Quatro novos testes Chromium percorrem interface, corrida autônoma, boxes, clima/SC, câmeras, mobile, modo manual voluntário, relatórios e continuidade da temporada.

As corridas dos testes usam `Race.step(1/60, {}, false)`: acelerar a execução do teste não sorteia resultado nem dirige pelo jogador. O SC e certos limiares são fixtures explícitos de teste; a chuva variável percorre o sistema real. Os testes browser verificam que o relógio continua enquanto a central é utilizada.

Os testes históricos de teclado/toque agora optam explicitamente por manual. A antiga asserção “alterar todos os bots via estratégia global” foi substituída por “alterar só o piloto e persistir seu plano”; as outras verificações de física, câmera, layouts, carreira, assets/áudio e sombras permanecem. Regressões encontradas (referência circular de inspeção, painel mobile, atualização de intenção de ultrapassagem e escopo de ordens de equipe) foram corrigidas, não ignoradas.

A aprovação final da suíte completa e do ZIP extraído está em `VALIDACAO-PACOTE-v08.md`. Limitações de plataforma: Chromium/SwiftShader por software; sem certificação em GPU/celular/gamepad físicos, outros navegadores ou audição humana.

## Medição de desempenho

Simulação: quatro execuções de 6.000 ticks/100 s simulados, seis carros, 8 voltas, Realista, Chefe de equipe; média das três aquecidas. Antes da implementação versus depois com o novo diretor habilitado. As políticas/traçados resultantes mudam intencionalmente; não é um replay de poses idênticas.

| Métrica | v0.7.1 | v0.8 |
|---|---:|---:|
| 6.000 ticks (ms) | 257.21 | 304.28 |
| Média por tick (ms) | 0.04287 | 0.05071 |
| FPS render-only | 3.202 | 3.232 |
| Submissão render JS (ms) | 2.278 | 2.133 |
| Draw calls | 131 | 131 |
| Triângulos | 93808 | 93808 |
| Geometrias | 103 | 103 |
| Texturas | 18 | 18 |

Render-only foi medido separadamente nos builds v0.7.1 e v0.8, três vezes por 8 s, mesmas poses congeladas de seis carros, Alto, 1280×720, com SwiftShader. Não inclui o custo de atualizar a central em movimento. A pequena oscilação de FPS não é alegada como ganho; não há certificação de 60 FPS em GPU física. O custo lógico adicional do diretor foi medido, não ocultado por reduzir bots/qualidade. Deliberação 1 Hz, transições na física fixa, UI limitada a ~1,4 Hz para conteúdo estratégico e logs limitados; nenhum RAF/timer por piloto.
