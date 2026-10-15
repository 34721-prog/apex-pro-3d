# Auditoria cirúrgica anterior às alterações de runtime

Base preservada: ZIP v0.8 SHA256 ab3737a057d3d3e66eef97e83f721e6e3e7e7c436ef088b3034325620a796174. Estrutura completa src/tests/config/docs inspecionada; referências históricas v0.7/v0.7.1/v0.8 e testes de boxes, colisões, gerenciamento, recursos e sombras lidos.

## Reprodução e referência
- `npm ci`, build e 143 testes Node originais passaram (112,23 s neste ambiente).
- Paddock decorativo em renderer.buildScenery repete uma fachada de 12 garagens sobre o pit físico de seis vagas. placeFacility usa at(0) + projeção linear, enquanto as vagas seguem at(s). Sobreposição OBB reproduzida nos 14 circuitos; dados before-pit.json. Verificação adicional do asfalto em before-road.json.
- O comprimento de 26 m da cobertura consome todo o espaçamento nominal de 26 m medido no eixo da pista, não no offset de 50 m do prédio. A curva interna comprime esse espaço: interseções locais nas seis pistas originais. O validador antigo só inspeciona pontos contra trechos REMOTOS; não cobre footprints nem pares de garagens/paddock.
- buildPit não guarda identidade/posse do conjunto: chamada repetida duplica malhas/equipe. A troca normal de World já descarta o anterior; não foi provada duplicação espontânea nesse fluxo normal.
- Estimador recalcula 96 curvaturas e 64 segmentos geométricos do pit em cada consulta. Candidato a cache SOMENTE da geometria, não de pneus, clima, carros, serviço, tráfego ou decisões.
- World.ready acompanha o GLB principal, mas não as texturas. Shaders compilam no primeiro desenho. A tela inicial não possui estado visível até a construção síncrona terminar. Tratamento de falha do GLB já usa o modelo procedural original equivalente, mas só informa o console.
- No loop: um RAF recorrente; física fixa 60 Hz e catch-up limitado. Sombras atualizam no mesmo frame por necessidade; não serão limitadas temporalmente. Torcida é instanciada, sem loop por espectador; telões 1 Hz, LOD 0,3 s, UI estratégica 700 ms. Pequenas alocações no áudio/HUD existem, mas não justificam refatoração generalizada.
- Produção Vite já sai em dist e copia public. URLs /assets são válidas no domínio raiz da Vercel; não há necessidade de reescrever todas para BASE_URL ou de SPA fallback (navegação interna não muda pathname).

## Medição
scripts/benchmark-stability.js: dois circuitos, seis carros, chuva, arquibancadas completas, 1280×720, qualidade custom equivalente Alto, sombras 1024/off, 20 frames de aquecimento + 80 medidos, seis ticks fixos por amostra. Mede intervalos RAF, JS da simulação/render/HUD/estratégia/venues e recursos; não mede conclusão GPU. Áudio excluído do benchmark, mas coberto por regressões. Chromium SwiftShader, não hardware real. before-browser.json contém dados, sem inferir GC a partir de um pico isolado.

## Plano restrito
1. PitLayout/PitVisuals: dimensões locais coerentes e compartilhadas, instalações anexas fora das garagens, grupo único idempotente, sem alterar trajetória, entradas/saídas ou vagas.
2. Renderer: consumir os mesmos poses das instalações; preservar batching/recursos, esperar texturas, preparar shaders e reportar falhas.
3. StrategyEstimator: cache das amostras imutáveis por curva, preservar aritmética e resultados.
4. Index/main e integração de carregamento: indicador indeterminado e erro útil, sem porcentagem fictícia.
5. Configuração estática Vercel, documentação, testes adicionais e validação completa extraída.
