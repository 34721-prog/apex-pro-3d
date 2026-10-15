# Auditoria v0.7 — cenário e áudio

Base: v0.5 validada. Projeto mantido: física fixa, diretor de prova, SC, clima, 7 competições, legado, 14 circuitos, 31 pilotos e 12 carros.

## Diagnóstico antes de alterar a aplicação
- `renderer.buildScenery` cria três arquibancadas idênticas próximas ao ponto inicial em todos os circuitos. Não cobre o restante dos 3–5,5 km. Só 630 caixas/espectadores e espaçamento de 2 m: sensação de assentos vazios.
- Estruturas usam referenciais locais, mas não validam todo o contorno de outras partes da pista. Público e coberturas devem partir de um plano geométrico compartilhado e validado.
- Pórtico tem postes fixos em ±11,2 m, inadequados à pista de 22 m: corrigir posição pela largura ativa.
- Há paddock, garagens, placas, pórtico, iluminação global e temas. Serão preservados; novos objetos não podem atravessá-los. Árvores/prédios devem respeitar as áreas das novas estruturas.
- `AudioEngine` possui um contexto, motor sintetizado e efeitos curtos, mas não possui música, público ou mixer de canais. Efeitos conectam diretamente à saída. A configuração geral precisa controlar todos os canais e a voz local.
- Menus não desbloqueiam áudio; `start()` é chamado na largada. Música exige primeiro gesto do usuário, transição com no máximo dois streams e lifecycle sem duplicação.
- Descarte do World já reúne geometrias/materiais/texturas; novos recursos inativos de LOD também deverão entrar nesses conjuntos. Nenhuma atualização CPU por espectador/quadro.

## Integração planejada
1. Planner determinístico por spline: dez setores de público por circuito, footprints validados contra pista, pit lane e outras arquibancadas.
2. Estruturas 3D por tema, multidão densa instanciada em atlas/sprites cruzados e animação coletiva no vertex shader; LOD troca geometria, não esvazia assentos.
3. Bandeiras articuladas, luzes emissivas e quatro telões compartilhando textura com dados reais, atualizada a 1 Hz. Sem novas luzes dinâmicas numerosas.
4. Composição instrumental original por síntese offline (sem samples comerciais), arquivos comprimidos e receitas/créditos. Torcida sintetizada em buffers limitados.
5. Mixer único: motor/efeitos/música/torcida, geral e preferências; música por cena, dois decks para crossfade, streaming sob demanda, pausa/saída/aba oculta.
6. Matrizes nas 14 pistas, inspeção visual dos setores, áudio com gesto/volumes/transições, regressões, comparação real e ZIP extraído.

Benchmark v0.5 capturado nesta missão antes das mudanças: `tests/performance/v07/before-*`. Ambiente Chromium/SwiftShader, não certificação de GPU real ou escuta humana.
