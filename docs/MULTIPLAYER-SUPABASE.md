# Multiplayer Google-only com Supabase

## Projeto provisionado

- Projeto Supabase: `apex-dynasty-3d-pro` (plano Free, região São Paulo `sa-east-1`).
- Referência: `kjvzbonieahvqobulggb`.
- Migrations multiplayer/RLS: `20261028211101` (`apex_dynasty_multiplayer`), `20261028211941` (`revoke_anon_public_table_privileges`) e `20261028220544` (`google_only_multiplayer_access`).
- O cliente de jogo só aceita usuários cuja identidade autenticada contém o provedor Google. O banco confere a claim assinada do JWT em RLS, políticas Realtime e RPCs; a interface não é a única barreira.

`.env.local` é ignorado pelo Git. O frontend usa somente uma **publishable key**. Nunca coloque o segredo OAuth do Google nem `service_role` / `sb_secret_*` em variável `VITE_*`, bundle ou repositório.

## Configurar o Google OAuth

1. No [Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials), configure a tela de consentimento OAuth e crie uma credencial **OAuth client ID** do tipo **Web application**.
2. Em **Authorized redirect URIs** no Google, adicione:

   ```text
   https://kjvzbonieahvqobulggb.supabase.co/auth/v1/callback
   ```

3. No [Supabase — Authentication Providers](https://supabase.com/dashboard/project/kjvzbonieahvqobulggb/auth/providers), habilite Google e cadastre o Client ID e o Client Secret. Mantenha o segredo apenas no painel Supabase.
4. No [Supabase — URL Configuration](https://supabase.com/dashboard/project/kjvzbonieahvqobulggb/auth/url-configuration), defina o Site URL real e permita os domínios/URLs de retorno usados pelo jogo (inclua o domínio de desenvolvimento e o domínio publicado).
5. Como o requisito do produto é Google-only, desligue **Anonymous Sign-Ins** em Authentication → Sign In / Providers. A opção pode continuar ligada na infraestrutura e o banco ainda bloquearia sessões anônimas, mas desligá-la evita criar identidades que o jogo não aceita.
6. Para desenvolvimento local, habilite o botão no ambiente Vite e reinicie o servidor:

   ```dotenv
   VITE_SUPABASE_URL=https://kjvzbonieahvqobulggb.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable-key>
   VITE_SUPABASE_GOOGLE_ENABLED=true
   ```

   A flag apenas mostra o botão; o provedor também precisa estar corretamente configurado no Supabase.

**Manual Identity Linking** só é necessário se houver sessões anônimas antigas que devam ser vinculadas a Google sem trocar o UUID da conta. Para usuários novos entrando diretamente com Google, não é requisito.

## Autorização Google-only e dados

- `profiles`, `rooms`, `room_players` e `race_results` têm RLS ativo. `anon` não tem privilégios diretos de leitura/escrita; clientes não têm `INSERT`, `UPDATE` ou `DELETE` direto nessas tabelas.
- Os usuários Google usam o papel Postgres `authenticated`, mas as políticas exigem também uma identidade Google presente em `app_metadata.providers` e rejeitam `is_anonymous=true`.
- RPCs públicas de multiplayer são wrappers `SECURITY DEFINER` que exigem a claim Google antes de delegar às implementações transacionais internas. As funções internas não são executáveis pelo cliente.
- Leituras seguem o escopo do perfil próprio, salas públicas e membros. Tópicos privados `room:<uuid>` só podem ser acessados por membros Google da sala; inputs continuam vinculados ao ID do jogador e snapshots só podem vir do host.
- O gatilho de Auth cria o perfil; o nome pode ser ajustado pela tela após o login. Nome ou UUID local não são prova de identidade.

## Desenvolvimento, build e deploy

```bash
cp .env.example .env.local
# Preencha a URL e a publishable key; configure a flag Google conforme descrito acima.
npm ci
npm run dev
```

As variáveis `VITE_*` são incorporadas ao bundle e devem ser públicas. Para produção, use a URL e publishable key do projeto, ative `VITE_SUPABASE_GOOGLE_ENABLED=true` e configure Site URL/redirect URLs para o domínio final. Não há deploy verificado nesta entrega.

## Protocolo e limites

- O host continua autoritativo para a simulação local. O começo é coordenado pela sala; inputs e snapshots dos carros trafegam via Supabase Realtime em intervalos de 50 ms; estado e resultados finais são persistidos por RPC. A timeline/frame-a-frame não é gravada no Postgres.
- É multiplayer com autoridade no navegador, não servidor dedicado: não há rollback, compensação de latência ou anti-cheat da física do host. Perda do host pode encerrar uma corrida ativa.
- A conta Google é necessária para entrar em salas. Uma conta anônima ou email-only não passa pelas políticas nem pelas RPCs, ainda que consiga obter uma sessão Supabase.
- O Supabase Free tem cotas, limites e possíveis pausas. A última consulta de saúde mostrou Realtime `ACTIVE_HEALTHY`, mas `db_connected` e `replication_connected` estavam `false`; ainda é preciso testar canal e corrida com duas contas Google independentes.
