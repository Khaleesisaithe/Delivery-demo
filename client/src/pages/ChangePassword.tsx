import { useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const change = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      if (user) utils.auth.me.setData(undefined, { ...user, passwordResetRequired: false });
      await utils.auth.me.invalidate();
      toast.success("Senha atualizada.");
      setLocation("/admin");
    },
    onError: error => toast.error(error.message),
  });

  return <main className="store-access-page"><section className="store-access-card">
    <span className="store-access-mark"><ShieldCheck size={25} /></span>
    <span className="eyebrow">PROTEÇÃO DA CONTA</span>
    <h1>Crie sua senha pessoal</h1>
    <p>Por segurança, a senha temporária precisa ser substituída antes de usar a área da loja.</p>
    <form onSubmit={event => {
      event.preventDefault();
      if (newPassword !== confirmation) return toast.error("As senhas novas não conferem.");
      if (newPassword.length < 12) return toast.error("Use pelo menos 12 caracteres.");
      change.mutate({ currentPassword, newPassword });
    }}>
      <label>Senha temporária ou atual<input type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
      <label>Nova senha<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
      <label>Confirme a nova senha<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      <button className="primary-button" disabled={change.isPending}><KeyRound size={17} /> {change.isPending ? "Salvando…" : "Salvar nova senha"}</button>
    </form>
  </section></main>;
}
