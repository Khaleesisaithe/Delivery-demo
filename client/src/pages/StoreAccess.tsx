import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, CheckCircle2, ChevronDown, CircleHelp, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, Store, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function StoreAccess() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const login = trpc.auth.login.useMutation({
    onSuccess: async account => {
      utils.auth.me.setData(undefined, account);
      await utils.auth.me.invalidate();
      toast.success("Acesso autorizado.");
      setLocation("/admin");
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!loading && user) setLocation("/admin");
  }, [loading, setLocation, user]);

  useEffect(() => {
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !robots;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    const previous = robots.content;
    robots.content = "noindex, nofollow, noarchive";
    return () => {
      if (created) robots?.remove();
      else if (robots) robots.content = previous;
    };
  }, []);

  return <main className="store-access-page">
    <section className="store-access-shell">
      <header className="store-access-header">
        <span className="store-access-brand"><span className="store-access-mark"><Store size={22} /></span><span><b>Área da equipe</b><small>Pedidos e rotina da casa</small></span></span>
        <span className="store-access-secure"><ShieldCheck size={15} /> Acesso protegido</span>
      </header>

      <div className="store-access-grid">
        <section className="store-access-card">
          <span className="store-access-eyebrow"><span /> ÁREA PRIVADA · SOMENTE CONVIDADOS</span>
          <h1>Seu acesso<br /><em>começa aqui.</em></h1>
          <p className="store-access-intro">Use o e-mail e a senha que o proprietário criou para o seu trabalho.</p>

          <form onSubmit={event => { event.preventDefault(); login.mutate({ email, password }); }}>
            <label htmlFor="team-email">E-mail de acesso</label>
            <input id="team-email" type="email" autoComplete="username" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@empresa.com.br" />
            <div className="store-access-password-label"><label htmlFor="team-password">Senha</label><span>Use sua senha pessoal</span></div>
            <div className="store-access-password-wrap">
              <input id="team-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder="Digite sua senha" />
              <button type="button" className="store-access-reveal" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            <button className="store-access-submit" type="submit" disabled={login.isPending || loading}>
              {login.isPending ? <><span className="store-access-spinner" /> Conferindo acesso…</> : <>Entrar na equipe <ArrowRight size={17} /> </>}
            </button>
          </form>

          <button type="button" className="store-access-help-toggle" aria-expanded={showHelp} aria-controls="store-access-help" onClick={() => setShowHelp(value => !value)}>
            <span><CircleHelp size={17} /> Como recebo ou crio um acesso?</span><ChevronDown size={17} className={showHelp ? "is-open" : ""} />
          </button>
          {showHelp && <section id="store-access-help" className="store-access-help-panel">
            <div className="store-access-step"><span>1</span><p><b>O proprietário abre “Equipe”</b><small>No painel da loja, ele informa seu nome e e-mail e cria seu perfil de funcionário.</small></p></div>
            <div className="store-access-step"><span>2</span><p><b>Você recebe uma senha temporária</b><small>O dono entrega a senha por um canal privado. No primeiro acesso, você deverá escolher outra senha.</small></p></div>
            <div className="store-access-step"><span>3</span><p><b>Precisa recuperar o acesso?</b><small>Peça ao proprietário para redefinir sua senha ou reativar a conta. Não existe cadastro público nem recuperação por link aberto.</small></p></div>
            <div className="store-access-role-grid"><article><UsersRound size={16} /><span><b>Funcionário</b><small>Recebe, atualiza e edita pedidos.</small></span></article><article><Store size={16} /><span><b>Proprietário</b><small>Pedidos, cardápio, equipe, loja e financeiro.</small></span></article></div>
            <div className="store-access-owner-note"><UsersRound size={16} /><span>Primeiro acesso do dono: crie a conta de proprietário uma vez com <code>pnpm owner:create</code> em terminal seguro conectado ao banco de produção. O dono então entra por aqui e cadastra a equipe dentro de <b>Equipe</b>.</span></div>
          </section>}

          <div className="store-access-assurance"><ShieldCheck size={17} /><p><b>Mesmo que alguém encontre esta página, não ganha acesso.</b><span>Não há cadastro aberto. A senha é conferida no servidor, as telas e ações são restritas por perfil, tentativas repetidas são limitadas e a sessão usa cookie protegido.</span></p></div>
          <div className="store-access-footnote"><CheckCircle2 size={14} /> Acesso individual · Alteração de senha no primeiro login · Sem link público de cadastro</div>
        </section>

        <aside className="store-access-side" aria-label="Informações de segurança">
          <span className="store-access-side-icon"><KeyRound size={24} /></span>
          <span className="store-access-side-kicker">SEU TRABALHO, SEU PERFIL</span>
          <h2>Tudo o que você precisa para tocar a operação.</h2>
          <p>Acompanhe pedidos, atualize etapas e ajude a casa a funcionar bem. Recursos do proprietário, como cardápio e financeiro, ficam restritos ao perfil autorizado.</p>
          <div className="store-access-side-list"><span><LockKeyhole size={15} /> Login individual e sem cadastro público</span><span><ShieldCheck size={15} /> Permissões verificadas no servidor</span><span><UsersRound size={15} /> Acesso criado e revogado pelo dono</span></div>
          <div className="store-access-side-bottom">Sua segurança começa com uma senha forte e exclusiva.</div>
        </aside>
      </div>
    </section>
  </main>;
}
