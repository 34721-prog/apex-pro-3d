# Validação do pacote v0.5

O pacote candidato foi extraído em uma pasta separada. Nenhum arquivo de fonte/assets foi buscado por caminho temporário externo ao projeto extraído.

## Execução realizada

1. ZIP aberto e verificado com `ZipFile.testzip()`; estrutura e arquivos essenciais conferidos.
2. Extração independente em `validacao-v05/Apex-Dynasty-v0.5`.
3. `npm ci`: dependências reinstaladas pelo lockfile, sem node_modules trazido do projeto original.
4. `npm run build`: aprovado. A compilação reconstruída produziu os mesmos bytes dos arquivos jogáveis incluídos.
5. `npm test`: **106 aprovados, 0 falhas, 0 skipped**.
6. `python start.py --port 5185`: jogo compilado executado a partir da cópia extraída, usando `public/assets` local, sem duplicação em playable.
7. `GAME_URL=http://localhost:5185 npm run test:browser`: **16 aprovados, 0 falhas, 0 skipped, 0 flaky**, aproximadamente 6,2 minutos.
8. `npm run assets:validate`: aprovado na cópia extraída.
9. Seletor, 14 circuitos carregados, controles reais, resultados/recordes, Sprint completo pela UI, nova temporada, contratos, treino, regras, SC, qualidade/câmeras, saves e legado incluídos na suíte.
10. Manifesto SHA-256 comparado arquivo a arquivo: **229 arquivos de payload** (fonte, build, assets, testes, scripts e configuração) idênticos entre a cópia testada e a entrega.

## Depois dos testes

Apenas documentação e evidências de execução foram acrescentadas ao ZIP final. O payload executável é comparado novamente ao manifesto da cópia testada, e CRC/estrutura final são rechecados. Não houve alteração posterior de física, IA, regras, UI, assets ou compilação.

Manifesto testado: `dd501ab2e094fb22dd9f411661fb41cab1a9147a4bd9c846415718b45e19ddc2`.

Evidências: `tests/performance/v05/extracted-install.txt`, `extracted-build.txt`, `extracted-logic.txt`, `extracted-browser.txt`, `extracted-assets.txt`, `browser-results-extracted.json`, `package-validation.json`, `seasons.json` e `safety-car-matrix.json`.

As sete temporadas somam **56 sessões físicas e 25 etapas**, todas registradas com finalistas; os ciclos de SC passaram nas **14 pistas**, e um incidente físico grave separado também foi ensaiado. O teste realista da temporada não aceita esconder bloqueios de boxes por encerramento por tempo limite.

## Limites de certificação

Chromium/SwiftShader por software, não GPU física. Não foram certificados Safari/Firefox, gamepad físico, áudio ouvido por humano, latência/VRAM de hardware ou sessões de muitas horas. O escopo funcional simplificado está descrito no relatório de entrega.
