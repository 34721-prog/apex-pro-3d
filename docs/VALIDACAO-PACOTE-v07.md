# Validação do pacote v0.7 — concluída

## Cópia independente efetivamente executada

Pasta: `/home/user/validacao-v07/Apex-Dynasty-v0.7`.
Servidor local: `python start.py --port 5185`, ligado à cópia extraída, não à fonte.

1. ZIP candidato extraído integralmente numa pasta diferente.
2. **npm ci aprovado**, usando o lockfile incluído; sem reutilizar node_modules da fonte.
3. **npm run build aprovado**. Os três arquivos gerados (`index.html`, JS e CSS com hash) ficaram idênticos byte a byte ao build jogável incluído.
4. **125/125 testes Node**, zero falhas, cancelados ou ignorados.
5. **20/20 cenários Chromium**, zero falhas, skips ou flaky/retries. Execução integral em uma passagem, aproximadamente 8,4 minutos.
6. **Validação de assets aprovada** e oito MP3s realmente decodificados/medidos novamente com FFmpeg.
7. **255 hashes SHA-256** de fonte, assets, build, scripts, testes e configuração conferidos contra `PAYLOAD-MANIFEST.json`.

Registros completos: `tests/performance/v07/extracted-install.txt`,
`extracted-build.txt`, `extracted-logic.txt`, `extracted-browser.txt`,
`extracted-assets.txt`, `browser-results-extracted.json`, `audio-decoded.json`
e `package-validation.json`.

## Fechamento do ZIP definitivo

Depois dos testes, somente documentação e evidências são atualizadas no ZIP;
o payload de execução/testes permanece exatamente o testado. O empacotador
verifica CRC, caminhos obrigatórios, duplicatas e exclusão de caches/segredos.
O manifesto do pacote final é comparado ao da cópia validada, e o ZIP final é
extraído novamente sobre essa cópia para nova conferência dos 255 hashes e do build.

Assets ficam uma única vez em `public/assets/`. `start.py` serve esses arquivos
para a compilação em `playable/`. Não se incluem node_modules, navegadores,
FFmpeg, caches, perfis, WAVs intermediários ou versões antigas do projeto.
O pacote contém manifests de dependências exatas, não duplicatas instaladas delas.

## Escopo e limites dos resultados

Os cenários incluem controles/HUD/toque, catálogo, contratos/admin/save,
campeonatos, boxes/SC, corrida nas 14 pistas, galeria/lotação/câmera/placar,
streams de música, volumes, pausa/aba oculta, repetição de corridas e torcida
espacial/eventos. Os testes de áudio usam sinais medidos no grafo Web Audio;
não houve audição humana nem teste de alto-falantes.

Chromium usa SwiftShader por software. O resultado não certifica GPU/VRAM real,
60 FPS, celular/gamepad físico, Safari/Firefox ou ausência absoluta de vazamentos.
A verificação dos recursos demonstra contagens não crescentes nos cenários
executados, não uma prova geral sobre memória nativa.

Cancelamentos intencionais de requests de mídia durante troca/reload são
registrados à parte (`media-navigation.json`). Apenas `media + net::ERR_ABORTED`
recebe esse tratamento; 4xx/5xx e demais erros continuam fazendo o teste falhar.
A primeira execução da fonte, que revelou essa diferença no harness antigo,
é preservada em `final-browser.txt`, com a repetição bem-sucedida das seis
regressões afetadas em `final-browser-followup.txt`. O resultado integral
canônico desta entrega é **`extracted-browser.txt`: 20 passed**.
