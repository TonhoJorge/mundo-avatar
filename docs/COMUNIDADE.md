# Comunidade: como ligar

O espaço de contribuições já está pronto no site, mas só abre quando existe um
banco de dados. Até lá, o site mostra "abre em breve" e as regras.

## O que fazer (uma vez só)

1. Crie uma conta grátis em <https://supabase.com> e um projeto novo (região
   São Paulo, se quiser).
2. No projeto, abra **SQL Editor**, cole todo o arquivo
   [`supabase/schema.sql`](../supabase/schema.sql) e clique em **Run**.
3. Em **Authentication > URL Configuration**, coloque em *Site URL*
   `https://avatarmaps.vercel.app` e em *Redirect URLs* também
   `https://tonhojorge.github.io/mundo-avatar/` e `http://localhost:5173`.
4. (Recomendado) Em **Authentication > Providers**, ligue **GitHub**. O login
   por e-mail já funciona, mas o plano grátis do Supabase envia poucos e-mails
   por hora.
5. Em **Project Settings > API**, copie a *Project URL* e a chave *anon public*
   para [`public/data/community.json`](../public/data/community.json):

   ```json
   { "url": "https://xxxx.supabase.co", "anonKey": "eyJ...", "providers": ["github"], "email": true }
   ```

   A chave *anon* é pública por natureza: as regras do banco (RLS e funções)
   é que protegem os dados. **Nunca** coloque a chave *service_role* aqui.

## Mudar as regras

Todos os números (credibilidade inicial, ganhos, perdas, limites, ouvidoria)
ficam na tabela `config`. Mude no **Table Editor** e a página de Regras do site
mostra os valores novos na hora.

## Testar as regras

As regras foram testadas num Postgres em memória (PGlite): aprovação, empate,
réplica e tréplica, limites por credibilidade, conta nova, voto no próprio
item, denúncia confirmada com banimento e anulação dos votos, e permissões
(ninguém escreve direto nas tabelas).
