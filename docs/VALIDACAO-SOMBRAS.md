# Validação extraída — Apex Dynasty v0.7.1

**Resultado: aprovado nos testes descritos abaixo, em 14/10/2026 (São Paulo).** Logs do navegador usam UTC e podem exibir 15/10.

## Pacote independente

1. Fonte/build congelados em `_candidate-shadows.zip`, SHA-256 `1cbb86072ca6d477280be6a64f153c5ef23579a4634352701d019f2255148405`.
2. Extração em uma pasta separada, sem compartilhar `node_modules` com a fonte.
3. `npm ci`: instalação limpa, 21 pacotes adicionados, zero vulnerabilidades reportadas pelo comando (não é certificação de segurança).
4. `npm run build:playable`: compilação concluída. Aviso conhecido do Vite sobre chunk maior que 500 kB, sem erro; nenhuma dependência nova.
5. `npm run assets:validate`: 12 carros e três peças GLB validados; dimensões/triângulos finitos.
6. `npm run audio:validate`: oito MP3s decodificados, duração/energia/hash válidos, zero amostras saturadas.
7. Servidor Python da cópia extraída, porta 5181; testes contra o build de produção recompilado, não contra o servidor da fonte.
8. `npm test`: **129/129 aprovados**, 82,66 s; zero falhas/ignorados.
9. `GAME_URL=http://localhost:5181 npm run test:browser`: **25/25 aprovados**, 621,31 s (10,4 min); zero falhas/ignorados/flaky.
10. Todos os **261 hashes do manifesto** coincidiram após os comandos, incluindo os três arquivos de `playable`: HTML, JS e CSS. Assim a recompilação da fonte extraída reproduziu o build fornecido.

Após essa execução foram agregados os logs/relatórios e corrigida uma referência documental no README. **Não houve mudança no código da aplicação, assets, lockfile, configuração executável, scripts ou testes.** A distribuição final usa esse mesmo conteúdo executável; o manifesto e o CRC são novamente verificados ao empacotar. As evidências não precisam compartilhar o hash do ZIP candidato, pois agora estão incluídas dentro do ZIP final.

## Cobertura integral

- Teclado, remapeamento, neutralização/release/blur/pausa, direção corrigida, toque e layouts.
- Compras/contratos/pintura, saves persistentes e corrompidos, catálogo, isolamento admin.
- Corridas, classificação/resultados, temporadas completas e premiação sem duplicação.
- Boxes físicos, grid máximo, serviço, câmeras, ciclos de recursos, regras/clima/Safety Car.
- Seleção/conclusão/carregamento das 14 pistas; arquibancadas, telões e materiais.
- Mixer/música/torcida, gesture policy, volumes e encerramento ao pausar/navegar/ocultar.
- Os cinco testes novos de sombras, incluindo matriz física→modelo→depth→cor, câmeras, IDs, pistas/reinícios, serviço real, pixels e colisão física.

Nenhum erro inesperado de console capturado pelos testes. O harness histórico de áudio distingue `net::ERR_ABORTED` provocado deliberadamente ao interromper mídia durante a navegação; não suprime erros arbitrários de rede. Não é uma declaração de inexistência de qualquer warning de driver.

## Evidências atuais

Em `tests/performance/shadows/`:

- `extracted-install.txt`, `extracted-build.txt`, `extracted-assets.txt`;
- `extracted-audio.txt` e `extracted-audio-decoded.json`;
- `extracted-node.txt`, `extracted-browser.txt`, `browser-results-extracted.json`;
- `extracted-validation.json`: 261 hashes coincidentes, build e estatísticas;
- `baseline-file-diff.json`: comparação com o ZIP v0.7 preservado, assets de jogo inalterados;
- JSONs de movimento/câmeras, identidade/pistas, boxes, colisão e pixels;
- `visual/`: capturas reais das condições e imagens diferenciais;
- `before-sync.*` / `after-sync.*`: diagnóstico da cadência antes/depois;
- benchmarks fixos, cadência artificial e resumo — metodologia/limites em `CORRECAO-SOMBRAS.md`.

A suíte específica não foi a única validação: os 20 testes browser anteriores foram executados novamente junto com os cinco novos. Os relatórios v0.7/v0.5/v0.4 continuam como histórico, não como substituto dessa regressão.

## Limites

Chromium headless/SwiftShader em Linux; sem GPU física, celular/gamepad físicos ou audição humana. Não certifica 60 FPS ou ausência universal de aliasing. Nenhuma redução de grid/resolução de sombras, desativação corretiva ou fonte de física paralela. O relatório técnico distingue fixes demonstrados, riscos mitigados e fixtures controlados.
