# Delivery White-Label — guia do projeto

Aplicação mobile-first de pedidos para restaurantes, hamburguerias, lanchonetes, açaíterias, sucos e marmitarias. Este repositório é um **template de código** para personalizar e implantar separadamente para cada empresa.

> **Modelo de isolamento:** uma implantação e um banco de dados por empresa. O aplicativo é single-store: ele **não** oferece multi-tenancy para várias empresas compartilharem o mesmo banco. Não conecte clientes distintos à mesma instância.

Inclui catálogo administrável, carrinho e checkout, pedidos e rastreamento público por identificador, painel privado, perfis de proprietário e funcionário, demonstrativo financeiro restrito ao proprietário, impressão de comanda, configurações de marca/loja e notificações de pedido pelo WhatsApp.

## Stack

- React 19, Vite, Tailwind CSS 4 e TypeScript
- Node.js 22, Express e tRPC 11
- MySQL 8.4, Drizzle ORM e migrações versionadas
- Autenticação própria com senha derivada via scrypt, sessões persistidas como hash, bloqueio por tentativas e troca obrigatória de senha temporária
- Docker Compose para MySQL local; imagens locais do cardápio sem dependência de storage proprietário

## Requisitos

- Node.js 22 LTS e Corepack/pnpm (versão indicada em `package.json`)
- Docker Engine/Desktop com Docker Compose, ou um MySQL acessível
- VS Code (opcional; há tarefas em `.vscode/tasks.json`)

## Rodar localmente no VS Code

1. Clone o repositório privado e abra a pasta no VS Code.
2. Ative Corepack e instale as dependências.
3. Crie a configuração local a partir do modelo `.env.example` usando o próprio VS Code; mantenha credenciais reais fora do Git. Os valores do modelo são **somente para desenvolvimento local**.
4. Suba o MySQL e inicialize esquema e configurações-base; inicie o servidor.

```bash
corepack enable
pnpm install --frozen-lockfile
# Crie/copie o modelo local com o VS Code; não publique seus segredos.
docker compose up -d db
pnpm db:setup
pnpm dev
```

Se uma migration falhar após executar parte do SQL, não fique repetindo `pnpm db:setup`: o MySQL pode confirmar DDL parcialmente antes do erro e a migration não fica registrada como concluída. Preserve/backup qualquer banco com dados. Em um banco local recém-criado e descartável, após atualizar para a correção, recrie o volume local somente se tiver certeza de que não precisa dos dados (`docker compose down -v` apaga o volume); depois rode novamente `docker compose up -d db` e `pnpm db:setup`.

Por padrão, abra <http://localhost:3000>. Se a porta local estiver ocupada, o servidor de desenvolvimento procura as próximas portas livres; leia a mensagem do terminal. O atalho do Docker expõe o MySQL na porta `3307` do host.

**Login local:** no modelo de desenvolvimento, `LOCAL_DEV_AUTH=true` permite inspecionar o painel sem criar uma conta. Funciona somente com `NODE_ENV=development`, e o servidor limita-se a `127.0.0.1`. É um bypass de desenvolvimento, não uma identidade persistida e **nunca deve ser ativado em produção**. Para testar permissões, selecione `LOCAL_DEV_ROLE=admin`, `staff` ou `user` e reinicie o servidor.

Para experimentar dados fictícios, aplique `pnpm db:seed:demo`. Pedidos fictícios são opcionais (`pnpm db:seed:demo-orders`) e devem ficar apenas em ambientes de demonstração. A inicialização normal (`pnpm db:setup`) cria as migrações e uma loja vazia, sem cardápio de demonstração. O seed é idempotente e evita sobrescrever cardápios existentes. **Não use** `docker compose down -v` se precisar conservar o banco local: a opção `-v` apaga o volume.

## Personalização de cada empresa

1. Crie a implantação e o banco isolados da empresa; não reaproveite dados de outra loja.
2. O nome, slogan, cor, banner e logotipo são definidos pelo responsável técnico durante a personalização do clone. O perfil de proprietário não os altera pelo painel.
3. Na área **Sua loja**, o proprietário configura telefone/WhatsApp, endereço, horários, fuso, taxa de entrega, pedido mínimo, prazo estimado, pagamentos e mensagem de fechamento; também controla abrir/fechar e iniciar uma pausa de uma hora.
4. Em **Seu cardápio**, o proprietário pode cadastrar categorias, itens, preços, adicionais, promoções e disponibilidade. Imagens podem ser escolhidas da galeria local já incluída no projeto ou informadas por URL HTTPS. Não há upload para armazenamento externo configurado.
5. Configure domínio, política de privacidade e termos da própria empresa. A aplicação não fornece aconselhamento jurídico nem publica uma política legal pronta. Antes de produção no Brasil, a empresa precisa revisar a LGPD, o aviso de privacidade e a base legal apropriada ao tratamento de dados de clientes.
6. Substitua conteúdo demonstrativo, confirme horários/preços/endereço/entrega e faça pedidos reais de teste controlado antes de divulgar.

O painel é acessado por uma rota privada aleatória centralizada em `client/src/const.ts`. **Não há link para a equipe no rodapé ou navegação pública.** O proprietário cria funcionários em **Sua equipe** e compartilha o endereço exato e as credenciais individualmente, por canal privado; não publique a URL em material destinado a clientes. O primeiro acesso com senha temporária exige que o funcionário escolha sua própria senha. O caminho aleatório reduz descoberta casual, mas não substitui login e autorização no servidor.

### Papéis

| Perfil                          | Acesso                                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Proprietário (`admin`)**      | Pedidos, edição dos dados/itens do cliente com confirmação, aviso manual pelo WhatsApp após editar, financeiro, cardápio, promoções, disponibilidade, abertura/pausa da loja e gestão de funcionários.                                                                               |
| **Funcionário (`staff`)**       | Visualizar pedidos, avançar status, contatar o cliente via WhatsApp/telefone, acrescentar observações internas com identificação do autor e imprimir comandas internas. Não pode editar dados/itens de pedidos nem acessar financeiro, catálogo, configuração operacional ou equipe. |
| **Cliente (`user`/sem sessão)** | Loja pública, checkout e acompanhamento do pedido por identificador público. Não existe cadastro público de equipe.                                                                                                                                                                  |

As regras críticas são verificadas no servidor; ocultar uma tela não é a única barreira. O dono inicial é criado diretamente no servidor, nunca por cadastro aberto ou senha padrão.

### Checkout, notas e impressão

- Nome e sobrenome e telefone/WhatsApp são obrigatórios para todo pedido. Para entrega também é exigido CEP válido, além do endereço; o botão **Buscar endereço** consulta ViaCEP para preencher rua/bairro/cidade quando disponíveis. O preenchimento é uma ajuda: o cliente precisa conferir e completar o endereço, número e complemento.
- O ponto de referência é opcional, com ajuda para o cliente fornecer informação útil ao entregador.
- Observações internas são anexadas (não sobrescritas), identificadas pelo nome do usuário que as escreveu e visíveis apenas à equipe. Elas aparecem na **comanda interna/Epson**, nunca na nota de entrega para o cliente. A nota de entrega e a comanda Epson têm seletores de impressão separados.
- Apenas o proprietário pode editar pedido/dados/itens. Antes de salvar há confirmação; depois abre o WhatsApp com uma mensagem pronta de atualização. O envio não é automático: o proprietário confere e toca em **Enviar** no WhatsApp.
- A pausa de uma hora recusa novos pedidos temporariamente e expira automaticamente. Abrir/fechar e pausar são ações exclusivas do proprietário.
- Uma promoção possui preço normal e preço promocional menor. O cliente vê o desconto e o backend salva o preço promocional no pedido; item esgotado pode ser marcado indisponível ou sua categoria pode ser ocultada. Estas alterações são exclusivas do proprietário.

## Criar o primeiro proprietário

Depois de configurar o banco, aplique as migrações e rode o inicializador em uma sessão de terminal interativa:

```bash
pnpm db:setup
pnpm owner:create
```

Informe nome, e-mail e senha pessoal de **ao menos 16 caracteres**; a senha é digitada sem eco no terminal. Ela não é impressa nem armazenada em texto puro. O comando recusa criar outro proprietário quando já existe um. Se precisar rotacionar a senha do proprietário, use o comando no servidor autorizado com o e-mail existente: a rotação encerra as sessões ativas daquela conta.

Em produção, desative o bypass local de autenticação. Proteja o comando de bootstrap, o acesso ao banco e as credenciais operacionais; não faça bootstrap em ambiente público com usuário/senha genéricos.

## WhatsApp: o que é e o que não é automático

- Ao criar o pedido, o cliente pode tocar em **Confirmar pelo WhatsApp**. Isso abre uma conversa `wa.me` com uma mensagem pronta no aparelho/navegador; a pessoa ainda precisa enviar a mensagem.
- O aviso automático de mudança de status é **opcional** e requer credenciais próprias da WhatsApp Cloud API da empresa: token, ID do número e modelo aprovado. Configure os segredos somente no provedor de hospedagem, fora do Git. O modelo deve estar aprovado em português (`pt_BR`) com os dois parâmetros esperados (número do pedido e status).
- Sem a API configurada, o painel sinaliza que a notificação automática não foi enviada. `wa.me` não é um serviço de disparo em segundo plano e o sistema não simula a entrega de mensagens.
- O uso da Cloud API está sujeito a permissões, cobrança, políticas e limites da Meta e depende da configuração da conta da empresa; a aplicação não inclui esses ativos nem garante aprovação.

O checkout registra a forma de pagamento selecionada, mas **não processa Pix, cartão ou cobrança**, não confirma recebimento e não integra um gateway financeiro. Configure os procedimentos comerciais de pagamento e entrega por empresa.

## Deploy de produção (VPS ou PaaS Node.js)

O processo da aplicação serve a API e os arquivos web e fornece `GET /healthz` para verificação de saúde. É possível usar VPS com proxy reverso ou uma plataforma gerenciada compatível com Node.js 22. Em qualquer opção:

1. Provisione **um banco MySQL privado por cliente**, sem porta pública desnecessária. Restrinja a rede/firewall aos hosts autorizados e faça backup automático criptografado, com retenção e testes periódicos de restauração.
2. Configure os segredos no gerenciador de variáveis do provedor (ou em arquivo de serviço protegido com permissões restritas): `DATABASE_URL`, `DATABASE_SSL=true`, `APP_URL=https://seu-dominio`, `NODE_ENV=production`, `PORT`, e `TRUST_PROXY_HOPS` apropriado à topologia. Se o servidor MySQL exigir CA própria, monte-a de modo protegido e informe `DATABASE_SSL_CA_FILE` como caminho absoluto. A conexão TLS valida certificado e nome do host; **não** desligue a verificação.
3. Configure DNS e HTTPS no proxy/load balancer e encaminhamento correto do protocolo/host. Ajuste `TRUST_PROXY_HOPS` ao número real de proxies confiáveis (padrão seguro `0`; não confie indiscriminadamente em cabeçalhos de IP enviados pela Internet). Não exponha a porta Node diretamente em produção.
4. Instale a versão LTS de Node 22 e dependências, aplique as migrations e inicialize a loja vazia:

```bash
pnpm install --frozen-lockfile
pnpm db:setup
pnpm owner:create       # executar uma vez em terminal interativo seguro
pnpm build
pnpm start
```

`pnpm start` executa o build de produção; mantenha o processo sob supervisor do provedor/systemd/container e configure reinício, logs, alertas para `/healthz`, atualizações de segurança e janela de manutenção. O servidor fecha as conexões de forma graciosa ao receber `SIGTERM`/`SIGINT`.

5. Configure `APP_URL` com a origem HTTPS canônica (sem caminho), confirme `DATABASE_SSL=true`, desligue completamente `LOCAL_DEV_AUTH`, confira alertas/limites e faça uma compra de teste usando o fluxo comercial correto. Antes de cada migration de atualização, faça backup e saiba como restaurar.
6. Opcionalmente, guarde as credenciais da WhatsApp Cloud API no cofre de segredos do provedor e confirme template, número, permissões, opt-in e fluxo de status.

Não compartilhe backups, dados de pedidos ou credenciais entre clientes. Defina política própria para retenção e exclusão de dados pessoais e para resposta a incidentes.

### Vercel

O projeto inclui um entrypoint Express no padrão da Vercel (`index.ts`), `vercel.json`, fallback SPA para rotas diretas (acompanhamento e a rota privada definida em `client/src/const.ts`) e build Vite servido como assets estáticos pelo CDN. A rota da equipe não aparece na navegação pública; seu nome difícil de adivinhar é apenas uma barreira contra descoberta casual, não substitui autenticação. A API tRPC roda no mesmo Express como uma Vercel Function; o limite da função está configurado em 60 segundos.

Para criar e conectar um MySQL passo a passo, consulte [GUIA-MYSQL-VERCEL.md](./GUIA-MYSQL-VERCEL.md). O guia usa TiDB Cloud Starter como exemplo e mostra como definir `DATABASE_URL` sem colocar credenciais no Git.

1. Importe o repositório privado `Khaleesisaithe/Delivery-demo` no time/conta corretos da Vercel (a integração GitHub precisa ter permissão sobre esse repositório). Use o projeto `delivery-demo` ou o projeto correspondente já existente, com a raiz na pasta do repositório.
2. No projeto Vercel, configure `DATABASE_URL` com o MySQL **privado e dedicado a esta loja** e `DATABASE_SSL=true` em Production e Preview. Adicione `DATABASE_SSL_CA` (certificado PEM, se o provedor exigir CA própria) ou monte um arquivo e defina `DATABASE_SSL_CA_FILE`; use no máximo uma das opções. Nunca coloque segredos no Git ou em código `VITE_*`.
3. Vercel injeta a URL da implantação; o app a usa se `APP_URL` não estiver definido. Se precisar fixar domínio, adicione a origem HTTPS canônica em `APP_URL`. Garanta que `LOCAL_DEV_AUTH` não seja ativado. Configure outros segredos da Cloud API do WhatsApp somente se for utilizar mensagens automáticas.
4. A loja demonstrativa `Khaleesisaithe/Delivery-demo` executa `scripts/vercel-build.mjs` no build. Somente o deploy de produção deste projeto aplica as migrations versionadas e semeia o catálogo demonstrativo — e apenas quando ainda não há produtos — com hambúrgueres, combos, açaí, sucos, marmitex e imagens locais; nessa primeira carga, a loja é aberta para aceitar pedidos. Uma etapa restrita deste mesmo projeto substitui apenas o nome genérico `Sua loja` por `Brasa & Ponto` e fotos de demonstração ainda não personalizadas. Nenhum pedido fictício é criado. Previews e clones de clientes não executam essas alterações automaticamente. O build de produção exige `DATABASE_URL` e usa TLS verificado (`DATABASE_SSL=true`).
5. Crie o primeiro proprietário uma única vez num terminal interativo seguro conectado **ao mesmo banco de produção**: `pnpm owner:create`. O comando solicita nome, e-mail e senha sem exibir a senha. O proprietário então abre a URL privada configurada em `client/src/const.ts`, entra, escolhe **Equipe**, informa nome/e-mail do funcionário e entrega a senha temporária por canal privado. O primeiro login exige a troca dessa senha. Não coloque credenciais em variável de build, comentário ou Git.
6. O dono do projeto deve confirmar que o provedor MySQL permite conexões TLS vindas da Vercel e restringir acessos de rede conforme os recursos do plano/provedor. Valide a publicação com `/healthz`, login da equipe, pedido demonstrativo, acompanhamento e uma operação de status. Um build “READY” não comprova que o banco ou o fluxo de pedidos está operacional.

Na rotina do painel: atendentes não alteram pedidos (itens, endereço ou cliente); eles podem avançar status, abrir WhatsApp/ligar e anexar notas internas com autoria. Só o proprietário altera pedido — exige confirmação e prepara uma mensagem de WhatsApp que precisa ser enviada manualmente. A nota de entrega omite notas internas; a comanda Epson interna pode incluí-las. O proprietário também controla abrir/fechar e pausa automática de 1 hora, cadastro de produto, preço de promoção, estoque e visibilidade de categoria. O checkout exige nome completo, WhatsApp e, para entrega, CEP; a consulta via ViaCEP é assistiva. Consulte **Checkout, notas e impressão** para detalhes.

O primeiro deploy para Preview não deve receber credenciais reais de produção. Configure uma base Preview separada ou mantenha a publicação não operacional até conectar o banco apropriado. A rota privada pode ser descoberta; não há cadastro público, endpoints administrativos exigem sessão e perfil autorizado, senhas são armazenadas com scrypt, contas bloqueiam após tentativas inválidas e sessões usam cookie `HttpOnly`, `Secure` em HTTPS e `SameSite=Lax`. O limitador de tentativas por IP guarda estado em memória do processo Express; em serverless não é um contador global entre instâncias. O bloqueio de tentativas por conta é persistido no banco; para maior resistência a ataques distribuídos, habilite o Firewall/WAF do provedor e considere rate limit distribuído.

## Acessos e credenciais no Codespace

As credenciais da loja não ficam em arquivos de código. O `.env` na raiz, se existir, contém configuração local sensível — normalmente a `DATABASE_URL` do MySQL — e **não é o usuário/senha de login da loja**. Para carregar variáveis do ambiente de produção, primeiro conecte o CLI da Vercel ao projeto correto (`vercel link`) e então execute `vercel env pull .env --environment=production` no terminal do Codespace. O arquivo é ignorado pelo Git; nunca o comite, envie por chat, fotografe ou cole sua saída. Se as credenciais foram salvas como secrets do Codespace, gerencie-as nas [configurações de Codespaces da sua conta GitHub](https://github.com/settings/codespaces) ou em **Settings → Secrets and variables → Codespaces** do repositório/organização. GitHub entrega esses valores ao Codespace autorizado como variáveis de ambiente; se um segredo já está salvo, você pode substituí-lo, mas não deve esperar revelar o valor antigo na tela.

Para listar **apenas nomes** das variáveis disponíveis no terminal sem imprimir seus valores, use `printenv | cut -d= -f1 | sort`. Evite `cat .env`, `printenv` sem filtro ou `echo "$DATABASE_URL"` em saídas compartilhadas. A senha do proprietário não pode ser recuperada em texto: o banco guarda apenas o hash scrypt. O comando `pnpm owner:create`, conectado ao banco certo, permite redefinir a conta existente informando o mesmo e-mail do proprietário; isso troca a senha e encerra as sessões atuais. Se o script disser que existe outro proprietário, pare e recupere o acesso com esse administrador, em vez de criar um usuário por fora. Senhas temporárias de funcionários aparecem uma única vez ao criar ou redefinir no painel **Equipe**.

## Operação e desenvolvimento

```bash
pnpm dev                 # desenvolvimento local
pnpm check               # verificação TypeScript
pnpm test                # suíte automatizada
pnpm build               # build de produção
pnpm start               # iniciar o build de produção
pnpm db:generate         # gerar migration após editar drizzle/schema.ts
pnpm db:migrate          # aplicar migrations pendentes
pnpm db:seed             # inicializador idempotente (sem conteúdo demo)
pnpm db:seed:demo        # cardápio fictício somente em ambiente de demonstração
pnpm owner:create        # criar/configurar proprietário em terminal interativo
```

Após alterar `drizzle/schema.ts`, gere e revise a migration SQL antes de aplicá-la; nunca substitua o banco do cliente por uma cópia da demo. Adicione testes para alterações de regras financeiras, papéis, autenticação e pedidos.

## Segurança e limitações conhecidas

- Produção exige domínio HTTPS e TLS de banco verificado; use senhas fortes, cofre de segredos, backup e atualização do sistema operacional/runtime.
- Faça review de backup/restauração, disponibilidade, monitoração, retenção, incident response, privacidade/termos e controles da conta Meta antes de vender como serviço hospedado.
- O pedido e dados pessoais são persistidos no banco para atendimento; identifique a empresa controladora, informe clientes, limite acessos e estabeleça retenção adequada.
- A aplicação não é um emissor fiscal, não processa pagamentos e não calcula rota/logística externa.
- Atualize dependências sob processo de revisão; teste migrations contra cópia restaurada antes de produção.

## Arquivos principais

```text
client/src/pages/Home.tsx            storefront, carrinho, checkout e acompanhamento
client/src/pages/Admin.tsx           painel adaptado a proprietário/funcionário
client/src/pages/StoreAccess.tsx     login privado da equipe
server/auth/                         senhas, sessões e fluxo de acesso
server/delivery/                     pedidos, cardápio, equipes e autorização
server/whatsapp.ts                   fallback wa.me e Cloud API opcional
drizzle/schema.ts                    tabelas MySQL e papéis
drizzle/                              migrações versionadas e snapshots
docker-compose.yml                   MySQL local para desenvolvimento
.vscode/tasks.json                   tarefas úteis para o editor
```

## Licença

Este repositório está marcado como `UNLICENSED`. Antes de redistribuir, vender ou conceder acesso ao código, defina e valide os termos de licença e direitos sobre marcas, fontes e imagens incluídas.
