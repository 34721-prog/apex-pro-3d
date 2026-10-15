# Auditoria anterior à correção — v0.7 → v0.7.1

## Sistema efetivamente usado

Sombras reais de DirectionalLight + PCFShadowMap do Three.js 0.186.1. Modelos procedurais e GLB possuem meshes castShadow; pista (Y=0,12), chão (Y=−0,06), boxes (Y=0,14) e outros meshes recebem o mapa. Não há elipses, sprites ou sombras avulsas por carro. Carro e sombra usam matrixWorld da mesma malha. Física XZ plana, sem suspensão/elevação simulada. A elevação de 14 cm durante o serviço é visual e já altera a malha; não exige offset de sombra artificial.

Game.frame integra passos fixos de física antes de World.render. Carros não têm interpolador separado; apenas a câmera usa lerp. Carros são criados depois do congelamento das matrizes do cenário. Não foram encontrados sprites presos ao cenário, uma posição inicial de sombra por carro, nem batching de carros junto ao asfalto. LightShadow.updateMatrices deriva a projeção da luz e do alvo. Three atualiza a projectionMatrix ao criar o render target: a ausência de updateProjectionMatrix explícito no construtor não é a causa inicial nesta versão.

## Defeitos/riscos verificados

1. **Cache temporal incorreto:** Quality desliga shadowMap.autoUpdate. World.render só marca needsUpdate a cada 0,1 s (Médio) / 0,05 s (Alto). Malhas atuais são desenhadas usando profundidade de poses antigas. Com dt=1/60, arredondamento chega a 7/4 quadros entre passes. Prova antes: before-sync.json. Dos 12 quadros observados, apenas 1 Médio / 3 Alto atualizaram os seis veículos; outros reutilizaram o mapa apesar de movimento.
2. **Volume centrado só no jogador:** frustum fixo de 150 m não considera o alvo de câmeras de box/SC nem outros veículos visíveis. Pode recortar sombras ao trocar o enquadramento. Não é um problema de coordenadas de tela; é cobertura do mapa no mundo.
3. **Grade instável:** luz/alvo acompanham posição fracionária do jogador sem alinhamento aos texels. Mesmo depois de remover o throttle, translações subtexel podem causar cintilação em arestas.
4. **Vínculo por índice:** render aplica drivers[i] em carMeshes[i]. O array normal da corrida é estável (retirados permanecem como obstáculos), mas remover/reordenar elementos deixa uma malha antiga visível ou associa a identidade errada. Deve usar ID e esconder ausentes, sem eliminar corpos retirados que ainda existem na simulação.
5. **Safety Car:** modelo não habilita castShadow. É uma omissão distinta; não é uma sombra congelada. Deve participar do mesmo sistema real.
6. **Contato e lifecycle:** normalBias=0,08 m pode separar visualmente contatos finos. Descarte de World não chama LightShadow.dispose explicitamente. Troca de qualidade descarta o render target sem liberar sua depthTexture explicitamente. Corrigir posse/liberação, sem alegar vazamento provado apenas por leitura.

## Plano

Uma única sequência pose de todos os veículos → animações/instâncias → ajuste estável de cobertura da luz → render e depth pass do mesmo quadro. Um mapa existente, resoluções preservadas, sem outro RAF, timers ou shadow objects por carro. Enquadramento de veículos visíveis mais região do alvo real da câmera, expansão quantizada com histerese, centro alinhado em espaço da luz. ID estável para modelos. Sombras projetadas nos receivers reais, não em plano global fictício. Testes instrumentados onBeforeShadow/onBeforeRender, imagens, comparação antes/depois, regressões e ZIP extraído.

Baseline medido antes de modificar a aplicação: tests/performance/shadows/before-*.

### Verificação adicional do lifecycle na dependência
`WebGLTextures.deallocateRenderTarget` já chama `depthTexture.dispose()` ao liberar um render target. Portanto **não** há evidência de que a troca de qualidade vazava depthTexture. A alteração usa `LightShadow.dispose()` para tornar explícita a posse no descarte do World e abranger map/mapPass; não adiciona uma segunda liberação manual da depthTexture.
