# Auditoria pré-implementação v0.8

Base: v0.7.1, arquivo original preservado. Inspeção antes de alterar a aplicação.

- Uma autoridade `Race.step`, física fixa 60 Hz e mesmo `botInput` para IA e piloto delegado. `Game.frame` já suporta chefe e simulação acelerada limitada a 120 ticks; campeonatos possuem ações delegadas. Não precisa criar outro simulador.
- A interface/defaults ainda apresentam corrida rápida e volante como fluxo principal. `Game.start` não delega a corrida rápida. Correção conceitual necessária: gerenciamento padrão inclusive em saves migrados; manual por decisão explícita e independente da modalidade.
- `assignStrategy` aplica o MESMO objeto/policy a todos os pilotos, inclusive rivais. Este é um problema funcional para comando de equipe. Substituir na camada de gerenciamento por políticas independentes, sem apagar compatibilidade da API histórica.
- Recursos já têm composto/saúde/temperatura/grip, combustível, danos, física de desgaste. Falta quilometragem de cada jogo de pneus e histórico de stints. Ritmo já modifica alvo e pedal, sem alterar stats/limites físicos; reutilizar isso, suavizar ordens, limitar ataque máximo.
- Boxes são físicos, com pit lane conectado, filas/reserva/serviço/merge. Estratégia antiga decide a 1 Hz e usa uma lista de voltas; pode religar pedido cancelado imediatamente. Separar deliberação nova da antiga quando um diretor estiver ativo; manter emergência explícita, ponto de compromisso e adiamento.
- Estimativa de pit anterior usa extensão S e velocidade constante 48 m/s. Nova estimativa deve usar trajetória real, limite, serviço e referência de ritmo; mostrar incerteza, tráfego e premissas, não tempo final garantido.
- `pit-options` e diário pausam a corrida. Adicionar central viva sem modal bloqueante/pausa; preservar pausa voluntária. Câmeras seguem sempre carro zero; separar ID observado de ID controlado.
- `assignTeam` cobre apenas mode=manager; grades das competições já têm duas vagas por equipe. Generalizar delegação, dados de pilotos e planos por vaga sem alterar IDs/posições e sem aplicar upgrades duas vezes ao companheiro.
- Temporadas persistem sessões/placares, mas não guardam plano versus execução. Adicionar histórico validado, limitado e JSON-only, preservando migração aditiva.
- A previsão do clima existente conhece estágios programados. A IA estratégica nova NÃO consultará os estágios, seed ou tempo da próxima mudança: só condições atuais/observadas. Informação pública dos rivais: composto, idade de stint, passagem, paradas/posição; não planos futuros ou combustível privado.

Antes das edições foi executado `benchmark-manager.js before`: 4 x 6.000 ticks, 6 carros, realista, chefe, mesmos parâmetros para o depois. Métricas brutas em tests/performance/v08. A v0.7.1 já tem 129 Node + 25 Chromium aprovados; a v0.8 exige regressão própria após implementação, não herda aprovação.

Sem ERS no modelo atual: não será criado um controle de energia fictício. Altimetria/suspensão continuam simplificadas. Não há garantia de estratégia vencedora, classificação inventada ou bônus secreto de velocidade.
