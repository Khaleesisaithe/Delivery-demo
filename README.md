# Brasa & Ponto — VS Code

Aplicação de delivery full-stack em português, pronta para abrir localmente no VS Code. Inclui storefront, catálogo, carrinho/checkout, pedidos e acompanhamento, painel da loja, perfis de proprietário/funcionário, fotos locais e banco MySQL.

## Requisitos

- Node.js 22 LTS; `corepack enable` para usar pnpm 10.4.1, conforme `package.json`.
- Docker Desktop (ou Docker Engine + Compose) para MySQL 8.4.
- VS Code.

## Inicialização (Windows, macOS ou Linux)

Abra a pasta do projeto no VS Code e rode no terminal integrado:

```bash
corepack enable
cp .env.example .env
pnpm install
docker compose up -d db
pnpm db:push
pnpm db:seed
pnpm dev
```

Abra `http://localhost:3000`. No PowerShell, no lugar do `cp`, use `Copy-Item .env.example .env`. Na primeira execução, aguarde o banco ficar saudável antes de `pnpm db:push`; migrations criam as tabelas e o seed insere menu/pedidos fictícios. São dados de demonstração: substitua telefone, endereço, preços, horários e imagens antes de uso real.

Há tarefas VS Code (`Ctrl/Cmd+Shift+P` → **Tasks: Run Task**) para iniciar MySQL, aplicar migrations, popular a demo, iniciar o app, rodar testes e gerar build.

## Acesso local de desenvolvimento

O `.env.example` habilita um usuário de desenvolvimento local como proprietário (`LOCAL_DEV_ROLE=admin`) para que o painel possa ser explorado sem criar credenciais Manus. Esse bypass só é ativado quando `NODE_ENV=development` **e** `LOCAL_DEV_AUTH=true`; quando ativo, o servidor se prende a `127.0.0.1`. **Nunca publique ou exponha o servidor com essa opção habilitada.** A autenticação local não é uma conta real, não cria usuário no banco e não substitui OAuth na hospedagem.

Para testar outros perfis, altere `LOCAL_DEV_ROLE` para `staff` ou `user` e reinicie `pnpm dev`. No modo staff, a API limita o usuário a pedidos/status/notas; admin testa ferramentas de proprietário. Para produção, desative `LOCAL_DEV_AUTH` e configure a autenticação OAuth aprovada no ambiente de hospedagem. Nenhuma credencial do ambiente Manus está incluída.

## Banco e dados demo

- `docker-compose.yml` cria só a instância MySQL de desenvolvimento, publica `3307` no host e mantém os dados num volume Docker. Ajuste `MYSQL_PORT` se essa porta estiver ocupada.
- Migrações: `drizzle/schema.ts` + `drizzle/*.sql`; `pnpm db:push` gera e aplica migrations locais.
- Seed inicial (cinco categorias e quatro pedidos fictícios): `pnpm db:seed`; inclui também açaí, sucos e marmitex sem duplicação.
- Somente categorias adicionais: `pnpm db:seed:expanded`.
- Remover e recriar o banco demo: `docker compose down -v` (APAGA o volume local e todos os dados locais).

## Comandos úteis

```bash
pnpm dev          # servidor + Vite
pnpm check        # TypeScript
pnpm test         # testes Vitest
pnpm build        # build de produção
pnpm start        # inicia build de produção
```

## Fotos e integrações

As fotos usadas pelo cardápio estão incluídas em `client/public/assets/food/`, então não dependem do storage Manus nem de um serviço externo. As fontes Google são carregadas pelo navegador; sem internet, a fonte do sistema é usada. O fluxo WhatsApp padrão abre `wa.me`; envio automático via Meta Cloud API é opcional e requer credenciais próprias no `.env` local (nunca commite segredos). Uploads pelo helper do Manus e outros serviços proprietários não são necessários para rodar este pacote.

## Papéis e segurança

- **Proprietário (`admin`)**: pedidos, financeiro, catálogo, configurações e equipe.
- **Funcionário (`staff`)**: operação de pedidos, atualização de status e observação; bloqueado pelo servidor de financeiro, catálogo, loja e gestão de equipe.
- Cliente não autenticado: loja, checkout e acompanhamento público.

Não há link público de acesso da equipe nesta cópia; o proprietário ainda definirá o endereço específico.

## Estrutura

```text
client/                  interface React, estilos, PWA e fotos locais
server/                  Express/tRPC, autenticação, pedidos, catálogos
drizzle/                 schema e migrations MySQL
shared/                  tipos, preços e utilitários comuns
.vscode/                 tarefas e extensões recomendadas
docker-compose.yml       MySQL para desenvolvimento
.env.example             modelo de configuração local sem segredos
```

## Validar antes de usar

```bash
pnpm check
pnpm test
pnpm build
```
