# Multiplayer real com Supabase

## Projeto e banco provisionados

- Projeto Supabase: `apex-dynasty-3d-pro` (plano Free, região São Paulo `sa-east-1`).
- Referência: `kjvzbonieahvqobulggb`.
- Migrations aplicadas: `20261028211101` (`apex_dynasty_multiplayer`) e `20261028211941` (`revoke_anon_public_table_privileges`), versionadas em `supabase/migrations/`.
- Verificação remota: as tabelas `profiles`, `rooms`, `room_players` e `race_results` existem; RLS está habilitado nas quatro. A migration aparece no histórico do projeto; `anon` não tem SELECT nem escrita direta nessas tabelas, enquanto `authenticated` tem leitura filtrada por RLS e não tem escrita direta.

O projeto foi configurado localmente em `.env.local`, arquivo ignorado pelo Git. A chave usada no frontend é uma **publishable key**, destinada a código público. Nunca coloque uma chave `service_role` / `sb_secret_*` em `VITE_*`, no repositório ou no navegador.

## Autenticação de convidado — ação necessária no painel

A configuração recém-consultada do projeto informa `external_anonymous_users_enabled: false`. A integração de gerenciamento disponível nesta sessão não expõe o campo de atualização de Anonymous Sign-Ins. Antes de testar a entrada como convidado:

1. No Supabase Dashboard, abra **Authentication → Sign In / Providers** (o nome pode aparecer como **Providers**).
2. Ative **Anonymous Sign-Ins** e salve.
3. Mantenha Google OAuth desligado se não quiser oferecê-lo. Ele é opcional; para ativá-lo depois, configure o provedor Google no Supabase, habilite **Manual Identity Linking** (necessário para vincular a identidade guest existente) e defina `VITE_SUPABASE_GOOGLE_ENABLED=true` no ambiente de build.

A identidade usada pelo jogo não é um nome/UUID inventado: `signInAnonymously()` cria uma sessão Supabase Auth real. O trigger `on_auth_user_create_profile` cria o perfil correspondente. O banco associa cada alteração de sala ao `auth.uid()` autenticado.

## Desenvolvimento e deploy

O workspace já tem `.env.local`. Para uma máquina nova:

```bash
cp .env.example .env.local
# Preencha a URL e a publishable key nas configurações públicas do projeto Supabase.
npm ci
npm run dev
```

As variáveis são lidas pelo Vite na inicialização/build:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key>
VITE_SUPABASE_GOOGLE_ENABLED=false
```

Para produção, configure os mesmos valores no ambiente do serviço de build/deploy e gere um novo build. `VITE_*` é incorporado ao bundle e, por isso, deve conter apenas dados públicos. Defina o domínio publicado como **Site URL** no Supabase e inclua os callbacks OAuth correspondentes somente se Google estiver habilitado. Não há deploy do jogo verificado nesta entrega.

## O que o banco faz

- Persiste perfis, salas/lobbies, membros, estado de prontidão e presença persistida por heartbeat; RPCs `SECURITY DEFINER` verificam `auth.uid()`, papel de host, limite de grid, pista e voltas (8–30).
- RLS é explícito em todas as quatro tabelas. Leituras ficam restritas ao perfil próprio/sala pública/membros da sala conforme o recurso; clientes não têm `INSERT`, `UPDATE` ou `DELETE` direto nas tabelas.
- Tópicos privados `room:<uuid>` usam políticas de `realtime.messages`; cada jogador só envia inputs vinculados ao próprio ID, e só o host envia snapshots.
- O host continua sendo autoridade da simulação local. Inputs remotos permitidos são validados e aplicados pelo host; snapshots de carro/estado são enviados por Supabase Realtime. O começo sincronizado é marcado no banco após a contagem regressiva e o host persiste o status/resultados finais via `finish_room_race`.
- Snapshots/timeline não são gravados no Postgres a cada frame. O protocolo usa mensagens Realtime em intervalos de 50 ms, sujeito à latência, perda e limites de payload do serviço.

## Limites importantes

Isso é multiplayer em tempo real com autoridade do host **no navegador**, não um servidor dedicado autoritativo. Regras de banco impedem usuários não membros de acessar o tópico e impedem um cliente de publicar input em nome de outro ID, mas não provam que a física executada pelo host é honesta. Não há rollback, compensação de latência, anti-cheat de simulação ou garantia de experiência competitiva em redes lentas. Se o host cair durante uma corrida, a sala pode ser encerrada pela regra de timeout; a migração não transfere uma corrida ativa para outra simulação.

O Supabase Free está sujeito às cotas, políticas de pausa e limites vigentes do plano. A existência das tabelas/RLS foi verificada remotamente. Na última consulta, o serviço Realtime apareceu `ACTIVE_HEALTHY`, mas os campos informativos `db_connected` e `replication_connected` vieram `false`; isso não substitui um teste de canal. Ainda não foi realizado um teste de corrida com duas sessões autenticadas independentes.
