# Publicar Apex Dynasty v0.8.1 na Vercel

**Preparado como aplicação estática; não foi publicado nem associado a uma conta/domínio neste trabalho.** Não há conector Vercel/GitHub disponível nesta sessão. Nenhuma credencial foi solicitada ou embutida.

## Configuração exata

| Opção | Valor |
|---|---|
| Framework Preset | Vite |
| Root Directory | pasta que contém package.json; `.` se o conteúdo da pasta extraída estiver na raiz do repositório |
| Node.js Version | 24.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment Variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable) e `VITE_SUPABASE_GOOGLE_ENABLED=true` |
| Rewrites / rotas | nenhum necessário |
| Backend / Python / API / banco | Supabase Auth + Postgres; OAuth Google obrigatório |

`vercel.json` fixa framework, instalação, build e saída. O runtime Node é selecionado nas configurações do projeto. O Vite já gera `dist/` por padrão, com `public/` copiado e Three.js empacotado localmente; não foi necessário alterar vite.config.js. A interface troca painéis sem history routing; não há URLs de páginas internas exigindo SPA fallback.

Cadastre as três variáveis da tabela na Vercel e configure o Site URL/redirect allow-list do Supabase com o domínio HTTPS publicado. O botão Google usa OAuth real; o app não libera a carreira até confirmar a sessão e obter o save da conta.

## Repositório e deploy

1. Extraia o ZIP. Entre em `Apex-Dynasty-v0.8.1`.
2. Envie para um repositório GitHub **o conteúdo dessa pasta**, incluindo `src/`, `public/`, `index.html`, `package.json`, `package-lock.json`, `vite.config.js`, `vercel.json`, `.gitignore`, `.vercelignore`, licenças, README, scripts e testes. Documentação/evidências podem ficar no repositório. Preserve os 135 arquivos de public, sem Git LFS para esses assets pequenos.
3. Não envie `node_modules`, caches, `.vercel`, arquivos `.env`, navegadores ou resultados temporários de Playwright. `dist` é gerado no build. `playable/` e `start.py` servem somente para a edição local; podem permanecer no repositório, mas **não** são o diretório de saída da publicação. `.vercelignore` exclui a cópia local/playable e evidências pesadas do upload CLI; o diretório estático final continua contendo todos os assets.
4. Na Vercel, Add New → Project → importe o repositório. Confira a tabela acima, selecione Node 24.x e publique.
5. Abra a URL HTTPS fornecida e confira o login Google, carregamento do save da nuvem, início da carreira, preparação, corrida autônoma, áudio após clique, troca de circuito e sincronização após uma alteração. No Network, GLB/PNG/MP3/WOFF devem responder corretamente; não devem retornar HTML no lugar de binários.

Os assets e chunks do jogo usam o mesmo domínio (`/assets/...`); autenticação, saves e multiplayer conectam ao projeto Supabase definido nas variáveis públicas. O runtime do navegador não chama localhost nem caminhos absolutos de máquina. O namespace `http://www.w3.org/2000/svg` é identificação de SVG embutido, não uma chamada de rede. URLs dos assets seguem HTTPS automaticamente quando a página usa HTTPS. O projeto está configurado para **raiz do domínio**, não para hospedagem sob um subdiretório; não mudar apenas BASE_URL sem adaptar também os URLs de assets nesse caso.

## Verificação local de produção

```bash
npm ci
npm test
npm run assets:validate
npm run build
npm run preview -- --port 5173
```

Outro terminal:
```bash
npx playwright install --with-deps chromium
npm run test:browser
```

Os testes também conferem o hash dos arquivos `public` recebidos por HTTP. `npm run build:playable` atualiza o pacote Python local para servir arquivos; esse modo continua exigindo internet, OAuth Google e Supabase por causa da autenticação/sincronização obrigatórias. A Vercel executa somente `npm run build`.

## Limitações de publicação

O console da Vercel, certificado HTTPS público, integração Git e limites da conta não foram verificados por deploy real. A validação é de build e entrega estática local, não de uma publicação inexistente. Há um aviso de chunk JS >500 kB (cerca de 0,93 MB bruto / 0,27 MB gzip), não falha de build. Não foi ocultado nem acrescentada biblioteca de splitting sem necessidade demonstrada.

A carreira é guardada por conta Google no Supabase; o localStorage serve apenas como cache e como origem da primeira migração quando a conta ainda não possui save na nuvem. Se já existir um save na conta, ele prevalece sobre o cache local. Não há exportação de save na interface. O admin local continua sendo ferramenta de desenvolvimento, não autenticação nem segurança de servidor.
