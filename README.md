# Apex Dynasty v0.10.0 — Composição dos circuitos

**BUILD THE TEAM. MASTER THE RACE.**

Continuação do projeto original: mantém o HUD e os 14 circuitos da v0.4, 31 pilotos, 12 carros, boxes, estratégias, carreira, campeonato legado e ferramentas locais. Mantém direção de prova central, acontecimentos físicos, clima evolutivo e sete competições com temporadas completas. A v0.7 acrescenta dez arquibancadas por circuito, público denso, telões reais e trilha sonora/torcida originais.

## Revisão v0.10.0

Continuação da v0.9: vegetação/rochas agrupadas, instalações auxiliares, perfis de ambiente dos 14 circuitos, relevo distante 3D, variação do solo e alcance/névoa da câmera aérea. Público, boxes físicos, luzes, sombras e movimento existentes preservados. A simulação não foi modificada.

O escopo amplo permanece **implementado parcialmente**, não certificado como completo. Veja `docs/CENARIOS-v010.md` para medições, cobertura visual, matriz de 34 itens e limitações, e `docs/AUDITORIA-CENARIOS-v010.md` para a investigação prévia.

## Revisão v0.9.0

Corrige articulação das quatro rodas GLB, separa esterço/giro e atitude da carroceria, deriva giro do deslocamento real por tick e interpola poses com o acumulador de 60 Hz. Apoio visual segue as superfícies existentes (incluindo zebras planas); elevação do serviço usa a fase real. Câmeras e sombras usam a pose final. Manager, regras, IA e assets permanecem preservados.

Diagnóstico: `docs/AUDITORIA-MOVIMENTO-v09.md`. Relatório A–F, matriz de 34 itens, métricas e limitações: **`docs/MOVIMENTO-v09.md`**. Evidências novas: `tests/performance/v09/`. A revisão não promete física completa nem elimina a limitação preexistente de envelope de colisão. Não há ganho geral de FPS demonstrado. Relatórios anteriores abaixo são históricos.

## Correção cirúrgica v0.8.1

Corrige o paddock antigo sobre as garagens/asfalto, ajusta os comprimentos das garagens à geometria local e impede criação repetida do pit. Preserva entrada, vagas, serviço, filas, saída, física e manager. Cache apenas de geometria imutável do estimador; carregamento real de texturas/GLB e preparação assíncrona de shaders, sem porcentagem inventada.

**Publicação estática na Vercel:** framework **Vite**, instalação **`npm ci`**, build **`npm run build`**, saída **`dist`**, Node **24.x**, sem variáveis de ambiente, backend, Python ou rewrites. Publique a raiz que contém `package.json`, não `playable/`. O deploy público não foi realizado por este trabalho.

Passo a passo: **`docs/VERCEL.md`**. Causas, arquivos alterados, métricas, testes e limitações: **`docs/CORRECOES-v081.md`**. Diagnóstico prévio: **`docs/AUDITORIA-v081.md`**. Evidências atuais: `tests/performance/v081/`. Os documentos das versões anteriores permanecem históricos.

## Experiência principal — chefe de equipe

**Os pilotos dirigem autonomamente por padrão.** Prepare equipe/pilotos/carros, abra **Estratégia** ou **Preparar equipe**, configure cada plano e inicie a corrida. No HUD, a central de estratégia continua funcionando **sem pausar a prova**. Em Competições, **Chefe de equipe** e **Simular sessão** não exigem volante.

- Dois planos independentes na grade normal de seis carros/três equipes: composto inicial, até seis janelas de parada, composto por stint e configuração física com contrapartidas de apoio/velocidade.
- Ritmo, ultrapassagens, defesa, conservação/temperatura dos pneus, combustível realista, rival a evitar, objetivo de campeonato e prioridade entre os pilotos.
- Pedidos/cancelamento/adiamento de boxes antes do compromisso, recomendações baseadas em dados atuais, rivais com planos próprios, reação a chuva/SC/VSC, undercut/overcut condicionais.
- **DIRIGIR (OPCIONAL)** assume somente o carro 1; **VOLTAR A GERENCIAR** devolve à IA sem reposicionar o carro ou apagar a estratégia. A câmera observada nunca escolhe quem você controla. Saves antigos migram para gerenciamento, salvo escolha explícita nova de modo manual.
- **Plano × execução** guarda as últimas 12 sessões concluídas. Campeonatos preservam também um resumo estratégico por sessão. Corridas em andamento não são persistidas no meio da volta; a temporada retoma da próxima sessão salva.

**Realista** habilita consumo de combustível e desgaste completo. **Arcade**, preservado, mantém consumo assistido/desgaste reduzido; o controle de conservação de combustível fica desabilitado nesse modo. Não há ERS nem um botão fictício de energia.

Relatório histórico de gerenciamento: **`docs/ENTREGA-v08.md`**. Auditoria: **`docs/AUDITORIA-v08.md`**. Validação extraída: **`docs/VALIDACAO-PACOTE-v08.md`**. Evidências: `tests/performance/v08/`. Relatórios anteriores são históricos.

## Correção técnica das sombras — v0.7.1

O mapa real de sombras agora usa as poses do **mesmo quadro** dos carros. Foram removidos os intervalos de 100/50 ms que deixavam profundidade antiga no asfalto. A projeção cobre veículos visíveis e o alvo da câmera, com alinhamento à grade dos texels e expansão estável. Modelos são vinculados pelo ID; veículos ausentes deixam de desenhar/castar, e o Safety Car também projeta sombra real.

Não foram adicionadas elipses, sombras por posição fixa, timers ou loops por veículo. A sombra usa os receivers reais da pista/boxes/terreno, incluindo a elevação visual durante serviço. Resoluções e controles gráficos permanecem os mesmos — Baixo/Sombras desligadas continuam sendo opções explícitas anteriores, não a solução para o bug.

Diagnóstico, testes e custos: **`docs/CORRECAO-SOMBRAS.md`**. Validação extraída: **`docs/VALIDACAO-SOMBRAS.md`**. Relatórios v0.7 e anteriores são históricos.

## Jogar sem npm ou internet permanente

1. Extraia `Apex-Dynasty-v0.8.1-Boxes-Desempenho-Vercel.zip`.
2. Entre na pasta `Apex-Dynasty-v0.8.1`.
3. Execute com Python 3:

```bash
python start.py
```

Abra **http://localhost:8080**. Outra porta: `python start.py --port 5173`.

Não use `file://`. Os assets ficam **uma única vez em `public/assets/`**; o servidor combina essa pasta com a compilação em `playable/`. Mantenha as duas. Three.js, fontes, retratos, modelos e texturas são locais. Não há API paga, CDN ou backend remoto.

## Instalar, desenvolver e testar

Node.js 20.19+:

```bash
npm ci
npm run dev -- --port 5173
npm test
npm run assets:validate
```

Com o servidor em outro terminal:

```bash
npx playwright install --with-deps chromium
npm run test:browser
# Outra porta (Linux/macOS):
GAME_URL=http://localhost:5185 npm run test:browser
```

`npm run build` gera `dist/`; `npm run preview` serve essa compilação. Para atualizar o servidor Python, execute `npm run build:playable`; o script copia apenas o build, compartilhando os assets de `public/`. `python scripts/package-release.py` gera o pacote limpo com manifesto SHA-256.

A regeneração opcional dos PNGs requer `python -m pip install -r requirements-assets.txt`. Jogar, compilar e validar os assets prontos não exige Pillow.

## Controles

- W / ↑: acelerar; S / ↓ / Espaço: frear **somente no modo manual**.
- **A / ←: esquerda; D / →: direita.** A conversão humana de yaw corrigida na v0.4 foi preservada.
- Esc: pausa; R: recuperação manual (invalida a volta); C: câmeras; P: chamada de boxes; Q: rádio.
- Gamepad: eixo esquerdo, RT/LT e Start. Remapeamento, sensibilidade, deadzone e toque mantidos.
- Antes do verde, acelerar pode mover o carro e gerar **queima de largada por deslocamento real**. Bots aguardam as luzes e seu tempo de reação.

Saves antigos com a inversão de contorno da v0.3 continuam sendo migrados uma única vez; o espelhamento explícito de acessibilidade permanece disponível.

## Arquibancadas e áudio — v0.7

- **10 arquibancadas em cada uma das 14 pistas**, em todos os três setores: 3.760–6.464 espectadores por circuito. Nível Baixo mantém a mesma lotação; usa geometria mais simples à distância.
- Em **Circuitos**, use **ARQUIBANCADAS · PRÓXIMA** para percorrer as dez posições; **VISTA GERAL** volta à planta 3D. A câmera opcional **Arquibancadas** também está no seletor da corrida / tecla C. A telemetria continua sendo do seu carro; use Chase para pilotar normalmente.
- Quatro telões por pista compartilham a classificação real, intervalos/tempos disponíveis e estado da sessão, a 1 Hz. Fora de uma sessão mostram boas-vindas, não resultados fictícios.
- Música original nos menus, seleção, carreira/campeonatos, grid e resultados. **Música na corrida é opcional e desligada por padrão.** Motor, efeitos e torcida continuam ativos independentemente dela.
- Um clique ou tecla libera o áudio conforme a política do navegador. Em Configurações: geral, música, motor, torcida, efeitos e rádio; ativação da música, música na corrida e redução durante a prova. Preferências são salvas sem apagar a carreira.
- Pausa/bandeira vermelha suspendem a música e os sons de pista. Aba oculta suspende o contexto; retorno não despausa uma corrida automaticamente. Sair da sessão encerra fontes de torcida e troca suavemente a música.
- Torcida **sintetizada**, com duas fontes ambientais próximas, atenuação e panorama pela posição do jogador; uma comemoração adicional limitada, acionada por largada, ganho de posição próximo, chegada/vitória real. Não é uma gravação humana nem uma simulação acústica completa.

Os oito MP3s estão prontos em `public/assets/audio/`, com manifesto, licença permissiva e créditos. A composição opcional usa `python -m pip install -r requirements-audio.txt`, FFmpeg com libmp3lame e `npm run audio:compose`. Não é necessário instalar essas ferramentas para jogar. `npm run audio:validate` decodifica/mede as faixas com FFmpeg.

## Direção de prova

Regulamento original **simplificado e inspirado em automobilismo**, não reprodução integral do regulamento atual da FIA.

- Verde, amarela setorial, dupla amarela, azul, quadriculada, advertência preta/branca e desclassificação preta.
- Amarela: reduzir no setor; dupla amarela: redução maior. Carros imobilizados/retirados recebem tratamento de obstáculo, não são obstáculos invisíveis.
- VSC por limite de velocidade (83 km/h no perfil Fórmula; 76 km/h no Junior), sem ultrapassagens. Há tolerância de frenagem e registro das infrações.
- Safety Car físico: sai de posição de espera fora das vagas, aguarda uma janela à frente do líder, entra pela saída dos boxes, forma fila, recolhe fisicamente e libera a relargada na linha. Câmera **Safety Car** opcional pelo seletor ou ciclo C; não é forçada. Nessa câmera, a telemetria continua sendo a do jogador, identificada no HUD.
- Vermelha: suspensão simplificada de 12 s com posição/relógio da prova congelados, sem reposicionamento. O clima continua evoluindo. Retoma neutralizada; não há regrid físico nem procedimento integral de interrupção FIA.
- Cada decisão registra regra, motivo, gravidade, evidência, tempo/setor, tipo e situação. Abra **REGRAS** no HUD ou o relatório da sessão.
- Vantagem por saída de pista usa a spline, a largura real e o percurso/posição; saídas forçadas por contato ou sem vantagem não recebem punição automática. A volta é invalidada para recorde.
- Tempos pendentes podem ser cumpridos **antes do trabalho dos mecânicos**. Depois de efetivamente cumpridos, não são somados de novo ao resultado.
- Quedas de grid por contatos traseiros claros na classificação são aplicadas na preparação da corrida. Devolução de posição tem prazo de 20 s; reincidência grave pode gerar bandeira preta no perfil fiscalizado.

Humanos e bots usam o mesmo controle de corrida, colisões, danos e regras. A dificuldade muda decisões/ritmo, não remove limites físicos. A neutralização possui assistência de limitação de velocidade para ambos.

## Acontecimentos e clima

Contatos, derrapagens severas, saídas, imobilizações, desgaste, danos, perda de potência, danos de asa e disputas possuem consequências físicas e registros. A asa tem deformação visual simplificada e perda de aderência; avaria mecânica reduz potência e leva a pedido de reparo.

Na preparação da corrida, escolha **Estável / Pancadas / Tempestade / Secagem** e avarias desligadas, 2% ou 8% por minuto. Os eventos mecânicos usam probabilidade por tempo simulado e semente, não punições aleatórias. Desligadas por padrão nas corridas comuns.

A pista passa gradualmente por seca/úmida/molhada, alterando aderência, comportamento e adequação dos pneus. Há previsão dos próximos estágios, intensidade de chuva, efeitos visuais e decisões dos bots por pneus/clima. Tempestade suficientemente forte pode suspender e neutralizar a sessão.

O modelo é uniforme por circuito, sem poças/aquaplanagem espacial. Não há detritos sólidos nem guincho físico; não se adicionam eventos fictícios para preencher o registro.

## Competições e temporadas

Use a segunda navegação: **Competições / Modo carreira / Calendário / Time Attack / Regulamento / Notícias e sessões**. O botão antigo **Campeonato** continua abrindo as três etapas legadas.

| Competição | Etapas | Formato | Diferença efetiva |
|---|---:|---|---|
| Apex World Championship | 6 | treino → classificação → corrida de 4 voltas | pontos 25/18/15… e bônus de volta rápida no top 3 |
| Apex Sprint Series | 3 | classificação de 1 volta → corrida de 2 | calendário urbano/costeiro e pontos 8/7/6… |
| Apex Junior Championship | 3 | treino → classificação → corrida de 3 | especificação de 54 m/s, regra Junior e meta de consistência |
| Apex Endurance Cup | 3 | classificação → corrida de 8 | consumo/desgaste maiores, clima variável e avarias opcionais ativas |
| Apex One-Make Cup | 4 | classificação → corrida de 3 | mesma especificação física para todos, sem vantagens dos upgrades da garagem |
| Apex Legends Invitational | 3 | classificação → corrida de 4 | seis personagens lendários originais; piloto emprestado dentro da competição |
| Apex Time Attack | 3 | solo, 2 voltas por circuito | medalhas por tempo real, carro monomarca e recordes da categoria |

Calendários, modelos, desempenho, sessões, pontos, metas, prêmios e condições estão em `src/championships/Catalog.js`. World/Endurance/Legends exigem reputação; campeonatos legados concluídos também contam para acesso.

- **Pilotar sessão**: controle humano. **Chefe de equipe**: delegado em tempo normal. **Simular sessão**: a mesma física em lotes limitados de até 120 ticks por quadro, sem sortear tempos ou favorecer o jogador com outra dificuldade.
- Treino e classificação são voltas reais. Grid vem do melhor tempo válido e das sanções, não de números gerados. A classificação é simplificada, sem Q1/Q2/Q3.
- Resultados oficiais incluem penalidades, tempos/intervalos, variação de posições, paradas, incidentes, motivos de abandono e pódio no relatório.
- Pontos de pilotos/construtores, vitórias, pódios, poles, voltas rápidas e abandonos são calculados dos resultados; IDs de sessão e deduplicação impedem premiação dupla.
- Ao terminar, a meta gera prêmio, campeão e histórico. Uma nova temporada arquiva a anterior sem zerar carreira/recordes.
- Salva-se cada sessão **concluída**. Fechar durante uma sessão não salva posições no meio da volta; essa sessão recomeça. Guarda-se a temporada corrente (até 24 relatórios) e até cinco temporadas anteriores com classificações/resultados.

**Não existe GT nesta entrega:** os modelos competitivos são monopostos. Não há menu GT fictício, fantasma gravado ou cerimônia de pódio 3D.

## Carreira e equipe

Seleção/contratação dos 31 pilotos e garagem de 12 carros continuam funcionando. Reputação libera competições e contratos de equipe; mudar de equipe custa créditos e altera garagem/dupla/nível de serviço na próxima temporada. Treino de consistência melhora o piloto **delegado** nas novas competições, sem alterar os atributos físicos dos carros monomarca.

Ordens no painel de estratégia: disputar livremente, manter a linha para proteger posição ou ceder ao carro principal. São limitadas pela segurança e pelas regras. Planos de paradas e filas por equipe permanecem reais; a reserva agora respeita a ordem física de chegada, inclusive quando o carro de ID maior chega primeiro.

Notícias são derivadas dos resultados, paradas, penalidades, abandonos, ultrapassagens e conquistas registrados. Não há reportagens inventando acidentes. Contratos são simplificados, sem salários, negociações ou trocas de piloto durante resistência.

## Conteúdo preservado

14 circuitos (6 originais + 8 da v0.4), 31 pilotos, 12 carros, pinturas/upgrades, quatro dificuldades, modos antigos, campeonato legado, eventos Mega, economia local, rádio/áudio, configurações e admin isolado. Pistas, SVGs, boxes e minimapas compartilham a geometria ativa. Consulte `docs/CIRCUITOS-v04.csv`.

Low/Medium/High/Custom, Medium padrão, adaptação visual opcional, física fixa e HUD Padrão/Compacto/Imersivo mantidos. Não se carregam todos os cenários 3D simultaneamente.

Laboratório: senha de desenvolvimento **123456789**, save separado. **Não é autenticação segura de cliente.** O jogo não coleta dados pessoais nem exige conta.

## Evidências, limites e estrutura

Relatório histórico de gerenciamento: **`docs/ENTREGA-v08.md`**. Validação extraída: **`docs/VALIDACAO-PACOTE-v08.md`**. Dados: `tests/performance/v08/`. Documentos e capturas das versões anteriores são históricos; a v0.7.1 corrigiu as sombras, preservadas nesta versão.

O ambiente de teste usa Chromium/SwiftShader por software. Não certifica GPU real, VRAM, 60 FPS, latência física, qualidade do áudio ou gamepad físico. A física é plana; controle de incidentes e culpa é heurístico, com evidências e limites documentados. Acidentes extremos que bloqueiem toda a largura podem exigir reiniciar/abandonar; não existe retirada automática por guincho.

Arquitetura principal:
- `regulations/RuleBook.js`, `RaceControl.js`: autoridade única de regras, fiscalização e instruções.
- `events/Weather.js`, `SafetyCar.js`: clima e ator físico de neutralização.
- `championships/Catalog.js`, `Seasons.js`: configuração, sessões, calendário, pontos, histórico e validação de dados.
- `core/CompetitionActions.js`, `Game.js`: integração de UI, execução e salvamento.
- `ui/CompetitionUI.js`, `RaceHUD.js`: menus, relatórios e HUD de direção de prova.
- `racing/`, `strategy/`, `ai.js`: física/colisões, boxes/recursos e IA existentes, estendidos sem substituição.
- `graphics/SafetyCarModel.js`, `renderer.js`: modelo original e renderização reutilizada.

O ZIP contém fonte, build jogável, assets únicos, licenças, lockfile, testes e documentação. Não inclui node_modules, navegadores, caches, perfis, segredos ou cópias antigas do projeto.
