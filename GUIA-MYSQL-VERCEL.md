# Guia passo a passo: MySQL para Delivery-demo na Vercel

Este guia conecta uma base MySQL compatível à aplicação `delivery-demo` e prepara o banco para receber pedidos. O provedor usado como exemplo é o **TiDB Cloud Starter**, porque é compatível com MySQL e possui integração com Vercel. Você pode usar outro provedor MySQL gerenciado, mas precisa obter dele uma URL MySQL com TLS.

> **Não envie sua senha, `DATABASE_URL`, arquivo `.env` ou print com credenciais pelo chat.** Digite os segredos somente nos painéis e terminais indicados. O arquivo `.env` é ignorado pelo Git neste repositório; confirme isso antes de qualquer commit.

## 1. Criar uma base MySQL no TiDB Cloud

1. Abra [TiDB Cloud](https://tidbcloud.com/) e crie uma conta ou entre na sua conta.
2. No painel, clique em **Create Resource** e escolha **Starter**. Antes de confirmar, confira o plano, a região e os limites atuais. A documentação do TiDB informa que o limite de gastos `0` mantém um recurso Starter no nível gratuito; limites maiores podem exigir cartão e gerar cobrança.
3. Dê um nome que identifique esta instalação, por exemplo `delivery-demo-prod`. Escolha uma região próxima dos clientes quando disponível.
4. Crie o recurso e aguarde ficar pronto.
5. Abra o recurso e clique em **Connect**. Use o endpoint público/standard connection para a primeira configuração. Se não houver senha definida, gere uma senha aleatória forte e salve-a em um gerenciador de senhas.
6. No painel de conexão, copie a **string MySQL completa**. Ela contém usuário, endpoint, porta e banco. Preserve integralmente o usuário, inclusive o prefixo da conta que o TiDB pode exigir.
7. Se a string não incluir a opção TLS indicada pelo TiDB, consulte os detalhes de conexão do próprio recurso. O formato documentado pelo TiDB é semelhante a:

   ```text
   mysql://USUARIO:SENHA@HOST:PORTA/BANCO?sslaccept=strict
   ```

   Use os valores que o painel gerou — não os exemplos acima. Se algum caractere da senha tiver significado especial em uma URL (`@`, `:`, `/`, `#` ou `%`), use a string de conexão fornecida pelo painel ou codifique a senha para URL; não tente adivinhar ou remover caracteres.

## 2. Configurar a Vercel com o segredo do banco

1. Abra a Vercel e entre no projeto **`delivery-app-demo`**.
2. Vá em **Settings → Environment Variables**.
3. Crie uma variável chamada **`DATABASE_URL`**.
4. Cole como valor a string de conexão completa copiada do TiDB. Marque o valor como **Sensitive/Secret**, se essa opção aparecer.
5. Selecione **Production** como ambiente. Não compartilhe a base de produção com Preview; para Preview, use uma base separada ou deixe-o sem dados reais.
6. Salve a variável. Neste projeto, `NODE_ENV=production` e `DATABASE_SSL=true` já foram definidos para Production. O código exige TLS com validação do certificado e do nome do servidor.
7. A Vercel não injeta uma variável nova nos deploys que já existem. Depois da gravação, abra **Deployments** e faça **Redeploy** do último deploy, ou espere o próximo deploy automático.

**Não é necessário** adicionar `APP_URL` para o domínio padrão da Vercel: o app usa a URL da implantação automaticamente. Se mais tarde houver domínio próprio, configure `APP_URL` como a origem HTTPS, sem caminho — por exemplo `https://pedidos.sualoja.com.br`.

## 3. Inicializar tabelas e conta do proprietário

O banco criado começa sem as tabelas da aplicação. Faça o bootstrap uma vez a partir do Codespace do projeto, em um terminal interativo:

1. Abra a pasta raiz do repositório `Delivery-demo` no Codespace. Se ainda não estiver atualizado, obtenha os commits recentes de `main` antes de continuar.
2. No VS Code, abra o arquivo `.env` local. Se ainda não existir, no terminal da pasta do projeto execute:

   ```bash
   cp .env.example .env
   ```

3. Edite `.env` **somente no Codespace** e substitua a linha `DATABASE_URL=...` pela string completa do TiDB. Acrescente ou ajuste:

   ```env
   DATABASE_SSL=true
   ```

   Para o servidor local, mantenha `NODE_ENV=development`, `PORT=3000` e `LOCAL_DEV_AUTH=true` como no modelo de desenvolvimento. Não substitua esses valores pelos de produção. Não faça commit do `.env`.

4. No terminal, confira primeiro que está na pasta correta e que o arquivo existe:

   ```bash
   pwd
   ls -la .env
   ```

5. Aplique as migrations e crie as configurações iniciais:

   ```bash
   pnpm install --frozen-lockfile
   pnpm db:setup
   ```

   Espere o comando terminar com sucesso. Se aparecer erro de conexão, TLS, usuário ou senha, pare e corrija os dados no painel/`.env`; **não repita indefinidamente** depois de erro de migration, pois o MySQL pode ter aplicado parte do SQL. Se houver dados que você precisa preservar, faça backup e peça ajuda antes de qualquer tentativa de recriar o banco.

6. Para preencher o cardápio fictício de demonstração, opcionalmente execute:

   ```bash
   pnpm db:seed:demo
   ```

   Esse passo é apenas para demo. Sem ele, o bootstrap cria a estrutura e categorias, mas não um cardápio de produtos.

7. Crie o primeiro usuário proprietário:

   ```bash
   pnpm owner:create
   ```

   Informe nome e e-mail no terminal. Digite uma senha única com pelo menos **16 caracteres** quando solicitado; a entrada da senha fica oculta. Use sua senha real somente no terminal privado, nunca em conversa, código ou histórico de comandos.

8. Para inspecionar localmente, inicie a aplicação:

   ```bash
   pnpm dev
   ```

   Em Codespaces, abra a aba **PORTS** e use **Open in Browser** na porta `3000`. Não digite `localhost:3000` no navegador do seu computador para acessar um servidor remoto do Codespace. Mantenha a porta privada.

O script `db:setup` é idempotente para uma primeira preparação: aplica migrations e cria configurações iniciais. Não substitua esse banco por um dump da demo. No primeiro login do proprietário, revise os dados da loja e mantenha-a fechada até concluir endereço, telefone, pagamento e cardápio.

## 4. Verificar a Vercel

Após configurar `DATABASE_URL` e fazer um novo deploy:

1. Abra `https://delivery-app-demo-khaleesi.vercel.app/healthz`. O endpoint deve responder com status saudável depois que a função alcançar a base.
2. Abra a página da loja. A tela inicial deve carregar o nome e configurações da loja; se o banco estiver vazio ou a URL incorreta, o cardápio não carregará.
3. Faça login do proprietário pela rota privada informada pelo responsável do projeto (o caminho fica centralizado em `client/src/const.ts`) e valide configurações, equipe e pedido de teste antes de divulgar o endereço.

**Importante:** no projeto demonstração atual, o SSO da Vercel no domínio padrão foi desativado para permitir que clientes vejam a loja. O painel interno continua exigindo login próprio e permissões da aplicação. A rota privada não é um substituto para essa autenticação.

## 5. Firewall e custo de conexão

A conexão do TiDB Starter usa um endpoint público com TLS e regras de firewall. A documentação informa que uma instância Starter nova pode iniciar permitindo conexões de todos os IPs; nesse cenário, mantenha uma senha única e forte, TLS ativo e credenciais só no cofre/variáveis de ambiente. Para restringir a origem às Vercel Functions, lembre-se de que a Vercel usa IPs de saída dinâmicos por padrão; IPs de saída estáticos da Vercel são um recurso pago para equipes Pro/Enterprise (a página oficial consultada informa US$ 100 por projeto/mês, mais tráfego de dados privado). Confira preço e disponibilidade atuais antes de ativar.

Para tráfego real de clientes, avalie conscientemente a restrição de rede/custo e os recursos do plano escolhido; não abra mais acesso do que o necessário. A integração do TiDB pode ajudar a inserir credenciais no projeto Vercel, mas confirme que ela criou especificamente `DATABASE_URL`, pois o app não lê apenas variáveis separadas como `TIDB_HOST` ou `TIDB_PASSWORD`.

## Fontes oficiais

- [Criar instância TiDB Cloud Starter](https://docs.pingcap.com/tidbcloud/create-tidb-cluster-serverless/)
- [Conectar TiDB Cloud a Vercel](https://docs.pingcap.com/tidbcloud/integrate-tidbcloud-with-vercel/)
- [Conexão pública e string de conexão do TiDB](https://docs.pingcap.com/tidbcloud/connect-via-standard-connection-serverless/)
- [Firewall de endpoints públicos do TiDB](https://docs.pingcap.com/tidbcloud/configure-serverless-firewall-rules-for-public-endpoints/)
- [IP de saída estático da Vercel](https://vercel.com/docs/networking/static-ips)
