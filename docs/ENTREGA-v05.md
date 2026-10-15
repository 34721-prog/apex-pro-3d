# Apex Dynasty v0.5 — entrega técnica

**Pacote:** `Apex-Dynasty-v0.5-Campeonatos-e-Regulamentos.zip`  
**Base:** v0.4 real, sem reiniciar o projeto.  
**Data:** 14/10/2026.

## Resultado implementado

### 1. Autoridade central de regras

`RaceControl` pertence a cada `Race`. IA, boxes, HUD, registro e resultados consultam essa autoridade. O antigo `Flags.js` tornou-se adaptador de compatibilidade, não um segundo sistema de penalidades.

`RuleBook` define identificador, condição, gravidade, evidências, consequência e momento de aplicação. Decisões registram carro/piloto, tempo, setor, motivo, evidência, tipo, segundos e situação. Existe registro limitado da sessão, acessível pelo botão REGRAS e pelos relatórios.

Implementados: advertência, tempo no resultado, tempo cumprido antes do serviço, devolução de posição com prazo, perda de três posições no grid por contato traseiro claro na classificação e desclassificação por reincidência grave em ordens ignoradas. O clube não desclassifica; Fórmula/Junior têm fiscalização mais estrita. Nem todo contato permite atribuir culpa: a atribuição automática usa aproximação traseira e alinhamento medidos.

As penalidades cumpridas não são adicionadas novamente ao resultado. O serviço captura os IDs de penalidades que está cumprindo; uma nova decisão durante o serviço não é apagada indevidamente. A animação dos mecânicos só avança depois da espera penal.

### 2. Bandeiras e neutralizações

- Verde normal; amarela e dupla amarela por setor; azul para retardatário sob aproximação real; quadriculada ao terminar; preta/branca de advertência e preta de desclassificação.
- Setores são definidos pela distância na spline, não por retângulos genéricos. Limites de pista usam largura ativa, afastamento lateral e percurso/posição. Vantagem e contato forçador são registrados separadamente.
- VSC com limite compartilhado por humanos/bots. A restrição auxilia a frenagem de ambos, com tratamento de desaceleração e tolerância; não dá imunidade a bots.
- Safety Car físico, com modelo próprio e posição de espera fora das vagas. Aguarda janela à frente do líder, sai pela faixa dos boxes, forma a fila, percorre a pista, retorna pelo corredor e estaciona sem reposicionamento. Mantém os seguidores limitados até estar efetivamente fora da pista. Obstáculos parados são contornados quando há espaço físico; se não houver espaço, não atravessa o obstáculo.
- Reinício controlado na linha de chegada depois do recolhimento. Carros nos boxes ou retirados são excluídos da comparação de ultrapassagens proibidas.
- Vermelha simplificada: 12 s de suspensão de posições/relógio, clima ainda evoluindo, seguida de neutralização. Não há regrid físico ou reprodução de todos os procedimentos FIA.
- Modelo do Safety Car criado uma vez por World; câmera opcional e marcador no minimapa. O HUD identifica que a telemetria continua sendo a do jogador ao observar o SC.

A ordem física de pista é explícita e separada da classificação por melhor volta de treino/classificação. Isso impede registrar uma melhoria de tempo como se fosse uma ultrapassagem física.

### 3. Incidentes e clima

Contatos e aproximações são medidos antes da resposta de colisão. Contatos dianteiros podem deformar visualmente a asa e reduzir aderência. Avarias mecânicas opcionais reduzem potência, geram evento e solicitação de reparo. Os reparos restauram os valores de fato.

Derrapagens severas, saídas, imobilizações e disputas são detectadas da simulação. O desgaste existente continua alterando aderência, temperatura e estratégia. Erros de frenagem sob pressão são raros, reproduzíveis por semente e dependem dos atributos; não existem acidentes textuais sem consequência física.

Quatro programas: estável, pancadas, tempestade e secagem. Intensidade varia gradualmente e a umidade acumula/seca ao longo do tempo. Aderência, pneus, física e decisões de boxes usam o mesmo estado. Previsão mostra os próximos estágios do programa. Chuva extrema pode interromper/neutralizar a prova.

Não há modelo de poças, aquaplanagem espacial, detritos sólidos, suspensão 3D de pista ou guincho. O evento de imobilização representa carro realmente lento/parado; não é uma cena falsa de brita.

### 4. IA e equipe

Preservados o controlador v0.4, antecipação de curvas, compromisso de linha, espaço lateral, quatro dificuldades e física compartilhada. Acrescentados consulta às instruções, formação sob SC/VSC, passagem de obstáculos imobilizados, azul, devolução de posição, defeitos/clima e ordens de equipe.

Pilotos têm atributos adicionais de chuva, largada e experiência, utilizados em reação e condução. Não há incremento secreto do limite físico por dificuldade. A simulação acelerada usa a mesma dificuldade que o modo chefe normal; não usa o controlador de teste que anteriormente dava ritmo “hard” ao carro do jogador.

Ordens reais: disputa livre, manutenção de linha para proteger posição e redução para ceder ao carro principal, sempre limitadas pela segurança. Rivalidades das disputas físicas passam também para a carreira das novas competições.

A reserva de boxes foi corrigida para seguir **a ordem física de chegada**, mesmo quando um carro de ID maior chega primeiro. Serviços já iniciados não são tomados. Essa correção eliminou um bloqueio natural entre companheiros encontrado na etapa de Sahara.

### 5. Sete competições completas, além do legado

| Competição | Etapas | Sessões | Especificação e pontuação |
|---|---:|---|---|
| World | 6 | treino / classificação / corrida | 4 voltas; 69 m/s; 25–18–15–12–10–8, bônus no top 3 |
| Sprint | 3 | classificação / corrida | 1 volta de classificação, 2 de corrida; 8–7–6–5–4–3 |
| Junior | 3 | treino / classificação / corrida | 54 m/s, aceleração/aderência menores, 3 voltas; 15–12–10–8–6–4 |
| Endurance | 3 | classificação / corrida | 8 voltas, desgaste/consumo maiores, chuva variável; 30–24–20–16–12–8 |
| One-Make | 4 | classificação / corrida | 3 voltas, carros fisicamente equivalentes; 20–16–13–10–8–6 |
| Legends | 3 | classificação / corrida | 6 pilotos lendários originais, 74 m/s; 18–12–9–6–3–1 |
| Time Attack | 3 | desafio solo | duas voltas reais, medalhas por tempo e recordes da categoria |

São **25 etapas e 56 sessões** por um ciclo completo de todas as competições. Calendários usam circuitos distintos e ordens diferentes. Não há GT apenas renomeando monopostos.

Treino/classificação percorrem voltas reais. Grid usa melhor volta válida e sanções. Resultados oficiais determinam pontos, construtores, poles, vitórias, pódios, voltas rápidas e abandonos; o Time Attack não concede pódios/vitórias fictícios contra um grid vazio. IDs e deduplicação por sessão/etapa evitam pontuar novamente um resultado.

É possível pilotar, delegar em tempo normal ou simular em lotes de até 120 ticks por quadro. Acelerar o processamento não altera `dt`, aderência ou regras, nem sorteia resultados.

Cada temporada tem meta, recompensa, condições de entrada e histórico. Uma nova temporada preserva carreira e recordes. Contratos mudam equipe/garagem/dupla/nível de serviço na temporada seguinte; treino afeta consistência do piloto delegado. Mercado dos 31 pilotos, garagem e economia antigos continuam disponíveis.

### 6. Menus, relatórios e persistência

Navegação secundária: Competições, Modo carreira, Calendário, Time Attack, Regulamento, Notícias e sessões. As áreas antigas continuam acessíveis. Cada competição tem monograma/cor próprios, descrição, calendário, formato, pontos, meta, próximos passos, classificação de pilotos/construtores e histórico.

Relatórios mostram resultado, intervalo, posições ganhas/perdidas, paradas, penalidades, incidentes, motivos de abandono, melhor volta, destaques e pódio de resultados. Notícias vêm dos dados, não de manchetes inventadas.

Save v1 recebeu campos aditivos e validação, sem zerar créditos, pinturas, pilotos, carros, recordes ou campeonato legado. Persistem sessões concluídas; não há salvamento de posições no meio de uma corrida interrompida pelo fechamento do navegador. Mantêm-se até 24 relatórios da temporada corrente e cinco temporadas anteriores com classificações/resultados. A retenção é limitada para evitar crescimento indefinido de localStorage.

## Validação e correções encontradas

**Validação final na cópia extraída: 106/106 testes Node e 16/16 testes Chromium aprovados, sem skipped/flaky/falhas.** Instalação, build, assets e execução da compilação também aprovados. O procedimento é registrado em **`VALIDACAO-PACOTE-v05.md`**. As evidências ficam em `tests/performance/v05/`.

Testes implementados/executados durante o desenvolvimento:

- Regressões das versões anteriores: direção, física, colisões, IA, todos os 14 circuitos, 31 pilotos/12 carros, boxes, planos, qualidade/câmeras, saves, compras, admin e campeonato legado.
- Bandeiras setoriais, VSC, azul, suspensão vermelha, advertências/preta e movimento real de queima de largada.
- Devolução de posição, penalidade servida antes da troca, grid da classificação e pontuação oficial sem duplicação.
- Umidade seca/úmida/molhada, efeito de falha mecânica/asa, reparos e comportamento desligado/ativado de probabilidades.
- **Ciclo completo do SC nas 14 pistas**, incluindo deploy, fila, volta de recolhimento, retorno, estacionamento e relargada: sem sobreposição e sem contato com o SC nos cenários examinados.
- Incidente físico de 65 m/s de aproximação gerado pelo sistema de colisão: a fiscalização detecta evidência, aciona o SC e ele contorna os carros imobilizados, sem surgir sobre eles.
- **Temporadas físicas completas das sete competições**, salvamento/reload após cada sessão, pilotos/construtores, objetivos, duplicação e início de outra temporada.
- Sprint completo pela interface no Chromium; treino/qualificação/corrida não são apenas menus.
- Configurações de clima/avaria/regra persistentes, contratos, treino, simulação acelerada, câmera SC e diário ao vivo.
- Regressão do HUD em 1920×1080, 1600×900, 1366×768, 1280×720, 768×1024 e 390×844; menu das competições também verificado no celular.

### Problemas que os testes revelaram

1. Seguidores aceleravam ao SC iniciar o retorno, antes de sair da pista: corrigido mantendo a referência do SC durante o retorno até a separação física.
2. Centrar todas as linhas ao neutralizar causava disputa artificial e ordens de devolução: preservadas linhas seguras, margem longitudinal e período de frenagem; passagem precisa estar completada, não ser uma oscilação centimétrica de ordenação.
3. Reserva de garagem por ordem do array podia bloquear um companheiro que chegava fisicamente primeiro: prioridade de chegada corrigida; o cenário de Sahara passou de encerramento por tempo limite para seis finalistas.
4. O primeiro coeficiente de umidade não chegava a “molhada” no programa de pancadas: evolução corrigida e estados físicos testados.
5. A validação do save recebeu indevidamente uma referência a variável de execução de sessão: o teste de reload detectou; a restauração foi separada da aplicação de recompensas e revalidada em temporadas inteiras.
6. O seletor de teste de calendário era ambíguo entre dois botões legítimos: teste passou a usar a navegação específica.
7. O conteúdo mínimo do grid de detalhes excedia a largura de celular: corrigidos `minmax(0,…)`, largura mínima e quebra das ações; não foi ocultado o conteúdo para fazer o teste passar.

8. A primeira extração encontrou uma referência fora do escopo em uma alteração de instrução setorial. O candidato foi rejeitado, corrigido, extraído de novo e a suíte completa foi repetida; ele não foi disponibilizado como entrega final.
9. O cenário de colisão grave mostrou que carros retirados recebiam velocidade de impulso sem participar mais da integração. Eles passaram a ser corpos imobilizados; a busca de obstáculos foi separada do carro concorrente mais próximo e os desvios que aumentam a separação passaram a ser permitidos. SC e bots respeitam também a cautela setorial mais restritiva. O cenário com destroços de veículos foi reexecutado e completou neutralização/relargada sem contato do SC.

## Desempenho — medição real v0.4 → v0.5

Chromium/ANGLE/SwiftShader, **renderização por software**, mesma fixture de seis carros, Aurora, High, 1280×720, DPR1, três execuções de 8 s, sem deslocamento causado por IA durante a comparação visual. Referência compilada v0.4 preservada e medida no ambiente desta missão.

| Medida | v0.4 | v0.5 |
|---|---:|---:|
| Frame médio | 243,13 ms | 248,56 ms |
| FPS médio | 4,11 | 4,03 |
| P95 das execuções | 266,6 / 266,6 / 283,2 ms | 283,4 / 266,7 / 250,1 ms |
| Draw calls / triângulos | 125 / 88.860 | 125 / 88.860 |
| Heap JS observado, média | 16,79 MB | 17,48 MB |
| Carregamento até assetsReady | 2.507 ms | 2.586 ms |
| CPU de 100 s simulados, média das últimas 3 execuções | 228,99 ms | 240,38 ms |
| Primeiro passe de CPU, mantido no JSON | 523,49 ms | 520,88 ms |

A última medição mostra **mais custo, não ganho de FPS**: aproximadamente +2,2% no frame médio e +5,0% na CPU desse benchmark. O heap cresceu ~0,69 MB. Execuções curtas num ambiente compartilhado variam; não atribuímos precisão de hardware real a esses resultados.

Matriz adicional com regras realistas: 2 carros, média 51,39 ms por 100 s simulados; 6 carros, 217,18 ms, com todos os passes disponíveis em `grid-performance.json`. Não é comparação direta entre corridas idênticas, e o máximo continua sendo seis carros.

Medidas de contenção aplicadas: broad phase de colisão por distância quadrática/raio reutilizado, inspeção de ocorrências a 4 Hz, estratégias a cadência separada, buffers/filas limitados, um SC por World, modelo/recursos reutilizados, cenário ativo único, HUD sem reconstrução contínua e nenhuma biblioteca pesada nova. Não há medição de VRAM, latência física ou certificado de 60 FPS em GPU real.

## Principais arquivos alterados

- `regulations/RuleBook.js`, `RaceControl.js`: catálogo e autoridade central de fiscalização/bandeiras.
- `events/Weather.js`, `SafetyCar.js`: evolução da pista e veículo físico de neutralização.
- `race.js`, `racing/Flags.js`, `Physics.js`, `CollisionSystem.js`: integração, grid, ordens físicas, evidências, danos e broad phase.
- `strategy/PitStop.js`, `PitStrategy.js`, `Resources.js`: penalidades servidas, reservas por chegada, clima/avarias/reparos.
- `ai.js`, `ai/Rivalries.js`, `data/drivers.js`: atributos, neutralização, tráfego, equipe e registros físicos.
- `championships/Catalog.js`, `Seasons.js`, `save.js`: competições, pontos, metas, histórico e validação.
- `core/CompetitionActions.js`, `core/Game.js`: sessões, modo acelerado, contratos, treino e integração de conclusão.
- `ui/CompetitionUI.js`, `competitions.css`, `RaceHUD.js`, `ui.js`, `Extras.js`: menus reais, relatórios, instruções e configurações.
- `graphics/SafetyCarModel.js`, `Effects.js`, `renderer.js`, `camera/CameraManager.js`: modelo original, chuva, avaria visual e câmera opcional.
- `tests/v05.test.js`, `tests/v05.spec.js`, benchmarks e documentação: validação e reprodução.

## Limites declarados

Não é implementação integral FIA. Culpa, bloqueio e vantagem são heurísticos explícitos; casos ambíguos não recebem atribuição automática completa. VSC é limite de velocidade, não delta oficial de mini-setores. SC não faz procedimentos de desdobramento de retardatários. Vermelha é suspensão sem regrid físico. Classificação não tem fases eliminatórias. Pódio é apresentado no relatório, não em cena 3D.

Não há GT com carroceria/física própria, fantasmas gravados, detritos sólidos, guincho, chuva espacial/poças, salários/negociação profunda ou troca de pilotos na resistência. A física é plana. Acidentes que bloqueiem toda a largura continuam fora da garantia do controlador. Salva-se entre sessões, não no meio da pista. Hardware real, som ouvido por humano, gamepad físico, Firefox/Safari e sessões de muitas horas não foram certificados.

O laboratório administrativo permanece local, com save separado e senha pública de desenvolvimento; não é autenticação segura. O ZIP não contém credenciais, caches, node_modules, browsers instalados ou dependências binárias duplicadas.
