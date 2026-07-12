# Norte House Burger — Painel de gestão

Sistema interno para precificar itens, gerenciar o cardápio (com fotos), registrar vendas e usar um assistente de IA — construído em Next.js + Supabase.

## 1. Rodar localmente

```bash
npm install
cp .env.local.example .env.local
# preencha .env.local com suas chaves reais (veja passo 2 e 3)
npm run dev
```

Abra http://localhost:3000

## 2. Configurar o Supabase (banco de dados + fotos)

1. Crie um projeto grátis em https://supabase.com
2. Vá em **SQL Editor** → cole o conteúdo de `supabase-schema.sql` → Run
3. Vá em **Storage** → New bucket → nome `menu-photos` → marque como **Public**
4. Vá em **Project Settings → API** → copie:
   - `Project URL` → cole em `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → cole em `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3. Configurar a chave da Groq (assistente de IA — gratuito)

1. Acesse https://console.groq.com → API Keys → Create API Key
2. Cole em `GROQ_API_KEY` no `.env.local`

A Groq tem uma camada gratuita generosa (limite de pedidos por minuto, mas cobre bem o uso de uma loja pequena). A chave nunca fica exposta no navegador — só é usada dentro de `app/api/chat/route.ts`, que roda no servidor.

## 4. Subir pro GitHub

```bash
git init
git add .
git commit -m "primeira versão do painel Norte House Burger"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/norte-house-burger.git
git push -u origin main
```

## 5. Deploy na Vercel

1. Acesse https://vercel.com → **Add New Project** → importe o repositório do GitHub
2. Em **Environment Variables**, adicione as 3 chaves do `.env.local`:
   - `GROQ_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Clique em **Deploy**

A cada `git push`, a Vercel atualiza o site automaticamente.

## 6. Domínio próprio

1. Registre o domínio (Registro.br para `.com.br`, ou Namecheap/Cloudflare para `.com`)
2. Na Vercel: **Project → Settings → Domains** → adicione o domínio
3. No painel do registrador, aponte o DNS conforme as instruções que a Vercel mostrar
4. O certificado SSL é configurado automaticamente

## Estrutura do projeto

```
app/
  page.tsx          → tela principal (cardápio, painel, assistente)
  layout.tsx         → layout raiz
  globals.css         → identidade visual (Norte House Burger)
  api/chat/route.ts  → rota segura que fala com a API da Anthropic
lib/
  supabase.ts         → cliente do Supabase
supabase-schema.sql   → schema do banco (rode no Supabase antes de tudo)
```

## Próximos passos sugeridos

- Adicionar autenticação (login do dono) antes de deixar isso público, já que hoje as políticas do Supabase são abertas para simplificar o setup inicial
- Levar as abas de "Precificação de item" e "Simulador de pedido" (que existiam na versão de teste) para cá, ligando o custo real dos ingredientes a cada item do cardápio
- Adicionar upload de logo da loja, salvo em `shop_settings`
