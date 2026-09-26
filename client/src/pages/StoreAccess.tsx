import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, LockKeyhole, Store } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function StoreAccess() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  return <main className="store-access-page">
    <section className="store-access-card">
      <Link href="/" className="store-access-back"><ArrowLeft size={16} /> Voltar à loja</Link>
      <span className="store-access-mark"><Store size={25} /></span>
      <span className="eyebrow">ÁREA PRIVADA</span>
      <h1>Acesso da equipe</h1>
      <p>Entre com o e-mail e a senha fornecidos pelo proprietário.</p>
      <form onSubmit={event => { event.preventDefault(); login.mutate({ email, password }); }}>
        <label>E-mail<input type="email" autoComplete="username" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@empresa.com.br" /></label>
        <label>Senha<input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder="Sua senha" /></label>
        <button className="primary-button" type="submit" disabled={login.isPending || loading}><LockKeyhole size={17} /> {login.isPending ? "Validando acesso…" : "Entrar na área da loja"}</button>
      </form>
      <small>O acesso é criado e controlado pelo proprietário. Não há cadastro público.</small>
    </section>
  </main>;
}
