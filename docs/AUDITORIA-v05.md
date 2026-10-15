# Auditoria v0.5 — antes das alterações

Base real: v0.4 integrada, 14 pistas, HUD persistente, perfis de IA, boxes físicos por equipe. A execução interrompida pelo usuário continuou em segundo plano: o log da cópia extraída confirmou **13/13 Chromium aprovados**, além de **76/76 Node** anteriores. O ZIP v0.4 fica preservado como checkpoint.

## Sistemas atuais e pontos de integração
- `Race` é o estado central e `FixedStep` fornece 60 Hz com RAF único. Física/colisões e recursos já são compartilhados por humanos/bots.
- `Flags.js` possui apenas VSC global por impacto >25, 16 s/23 m/s. Penaliza comparação agregada de posições; pode confundir carros que param nos boxes com ultrapassagens ilegais.
- `PitStop.js` aplica diretamente +5 s por velocidade. Não há decisão estruturada, cumprimento em boxes ou desclassificação.
- `CollisionSystem` conhece contatos/velocidades, mas não registra evidência para fiscalização. Nem todo contato permite determinar culpa: só contatos traseiros claros terão atribuição automática.
- IA v0.4 já tem espaço lateral, compromisso, antecipação, defesa e quatro dificuldades. Precisará consultar limites e instruções de uma única direção de prova.
- Clima é binário/fixo; pneus, combustível, temperatura, danos e abandono existem. Podem receber um estado contínuo de umidade sem alterar a arquitetura.
- Campeonato legado: 3 etapas fixas, 6 carros, pontuação simples e persistência. Será preservado. Novas competições terão estado próprio idempotente e calendário, sessões e classificação configuráveis.
- Save v1 já valida catálogos/preferências; a migração será aditiva, sem zerar carreira, créditos, recordes ou o campeonato antigo.
- `Game.finish`/`rewardRace` e UI de resultados são os pontos de integração de temporadas, relatórios e notícias.

## Ordem e escopo
1. Regulamento/comissários e journal central.
2. Bandeiras setoriais, VSC, azul, advertências/desclassificação e vermelha simplificada; evidências reais.
3. SC como ator físico fora do grid competitivo, estacionado fora das vagas e usando corredores válidos; saída à frente do líder, formação e retorno sem reposicionamento.
4. Umidade/clima gradual, previsão determinística, avarias opcionais e atributos/ordens de equipe.
5. Sete competições compatíveis (World, Sprint, Junior, Endurance, One-Make, Legends e Time Attack), sessões físicas, pontos/temporadas e carreira. GT real/ghost dependem de modelos/sistemas adicionais e não terão botão fictício.
6. UI, regressões, temporadas completas, benchmark, ZIP e validação extraída.

Regras são originais e simplificadas, inspiradas em automobilismo. Não se afirma conformidade integral com a FIA. Bandeira vermelha será suspensão da simulação sem regrid físico; incidentes extremos, remoção de destroços e avaliação subjetiva de culpa exigem limites explícitos.
