# Validação extraída — Apex Dynasty v0.8

## Resultado

**143 testes Node e 29 testes Chromium aprovados na cópia extraída**, sem falhas, ignorados ou flaky. Código, scripts executáveis, assets, dependências, configuração, testes e build foram congelados antes dessa execução. Depois dela, apenas documentação e evidências foram agregadas à distribuição.

## Procedimento independente

1. Candidato completo: SHA-256 `c9710a30b008bc5d1285517e560978d18b2a29c5560edb6ccf8712d26558f728`, 422 entradas. É o candidato anterior à inclusão dos logs finais, não o hash do ZIP publicado.
2. Extraído em outra pasta; sem symlinks para a fonte e sem copiar `node_modules`.
3. `npm ci`: 21 pacotes instalados; zero vulnerabilidades reportadas pelo comando. Isso não substitui auditoria de segurança.
4. `npm run build:playable`: sucesso, com o aviso conhecido de chunk >500 kB. Nenhuma dependência nova foi adicionada.
5. `npm run assets:validate`: os 12 carros e três peças GLB passaram, com geometrias/dimensões finitas.
6. `npm run audio:validate`: oito MP3s decodificados/medidos e hashes conferidos, sem amostras saturadas. Não é avaliação auditiva humana.
7. Servidor Python de produção da cópia extraída, porta 5183. Suíte apontada para esse servidor, não para a fonte original/Vite.
8. `npm test`: **143/143**, 94,58 s. Inclui 129 testes anteriores e 14 novos.
9. `GAME_URL=http://localhost:5183 npm run test:browser`: **29/29**, 769,92 s (12,8 min). Inclui os 25 anteriores e quatro novos.
10. Após instalar, recompilar e testar, os **271 arquivos do manifesto** conservaram exatamente seus hashes. A recompilação reproduziu os três arquivos fornecidos de `playable` (HTML, JS e CSS).

Logs do navegador registram UTC. A validação completa iniciou em `2026-10-15T03:01:24.804Z`. O pacote é portável: `start.py` resolve os caminhos relativos à pasta extraída e serve `playable`/`public`; nenhum arquivo temporário desse ambiente é necessário para jogar.

## Evidência funcional

- Corridas completas de cinco voltas, grid de seis carros, seca e chuva variável, conduzidas pela IA sem input humano e com paradas físicas/stints registrados.
- Temporada Sprint inteira, seis sessões, com resultados/pontos e validação do save a cada sessão; teste browser adicional atravessa a primeira sessão, recarregamento e corrida seguinte por menus reais.
- Preparação individual, comandos com efeito mensurado sobre distância/consumo/desgaste/temperatura, alteração de overtaking real, prioridade por pontos e proteção restrita à equipe correta.
- Cancelamento antes do compromisso, adiamento sem religamento imediato, serviço e trocas reais, undercut condicional e overcut que efetivamente adia uma parada dentro da janela.
- UI em andamento: relógio da corrida avança enquanto ordens/central são usados; câmeras e seleção de carro não ativam direção manual.
- Troca manual/IA preserva exatamente posição, volta, pit e plano no instante da transição. Cockpit permanece junto ao piloto observado, inclusive após avanço da física.
- Chuva do sistema existente e SC controlado como fixture de teste, não eventos fabricados da implementação.
- Full regressions de teclado/toque/rebind/blur, layout, economia/save/admin, temporadas e premiação, SC/clima/regras, boxes/filas, recursos gráficos, 14 pistas, arquibancadas, telões e mixer/torcida.
- Todos os cinco testes de sombras passaram: transforms atuais depth/cor, IDs, câmeras, pistas, boxes, colisões e comparação de pixels. O fixture de deslocamento mediu erro de centroide de aproximadamente 1,65 cm; remoção deixou **zero pixels residuais** acima do limiar.

Nenhum erro inesperado capturado nos testes de console. Os harnesses históricos distinguem cancelamento intencional de streams (`net::ERR_ABORTED`) ao trocar/limpar áudio; não há supressão genérica de falhas de rede/JavaScript.

## Arquivos de prova

`tests/performance/v08/` contém:
- `extracted-install.txt`, `extracted-build.txt`, `extracted-assets.txt`, `extracted-audio.txt` e `extracted-audio-decoded.json`;
- `extracted-node.txt`, `extracted-browser.txt`, `browser-results-extracted.json`, `extracted-validation.json`;
- `full-races.json`, `season.json`, `tactical-effects.json`, `browser-race.json`, `weather-browser.json`;
- `shadow-*.json`, `preserved-assets.json`, benchmarks `before-*`/`after-*` e `summary.json`;
- capturas atuais em `visual/` (planejamento, corrida, SC, chuva e celular).

A distribuição não repete as grandes capturas históricas de todas as versões. Elas permanecem nos ZIPs originais preservados; não são assets de execução. Fontes, modelos, texturas, fontes tipográficas, música, licenças, scripts e testes continuam completos. Os assets de `public/` são byte a byte iguais à v0.7.1.

## Limites

Chromium headless/SwiftShader em Linux. Sem certificação de 60 FPS em GPU física, teste em gamepad/celular físico, outros navegadores ou audição humana. A estratégia é uma heurística local com estimativas aproximadas, não previsão perfeita. Não há ERS, estoque limitado de jogos ou salvamento no meio da corrida. Detalhes e custos medidos estão em `ENTREGA-v08.md`.
