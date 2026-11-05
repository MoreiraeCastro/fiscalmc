import Link from "next/link";
import { Brand } from "@/components/brand";
import { redirect } from "next/navigation";
import { PORTAL_URL, portalLoginUrl } from "@/lib/auth/portal";
import { officeLogin } from "./actions";

export const metadata = { title: "Acesso do escritório" };
const errors: Record<string, string> = { invalid_credentials: "Email ou senha inválidos.", rate_limited: "Muitas tentativas. Aguarde um minuto e tente novamente.", configuration: "O acesso está temporariamente indisponível." };

export default async function OfficeLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // Login único: em produção a equipe entra pelo login do portal.
  if (PORTAL_URL) redirect(portalLoginUrl());
  const { error } = await searchParams;
  return <main className="auth-layout"><aside className="auth-brand-panel"><Brand inverse/><div><h2>Operação fiscal em um só lugar.</h2><p>Gerencie empresas, prontidão, certificados e emissões com segurança.</p></div><small>Ambiente exclusivo do escritório</small></aside><section className="auth-card">
    <Brand />
    <h1>Acesso do escritório</h1>
    <p>Área administrativa para a equipe Moreira &amp; Castro.</p>
    {error && errors[error] && <p className="alert error" role="alert">{errors[error]}</p>}
    <form action={officeLogin}>
      <div className="field"><label htmlFor="office-email">Email</label><input className="input" id="office-email" name="email" type="email" autoComplete="username" required /></div>
      <div className="field"><label htmlFor="office-password">Senha</label><input className="input" id="office-password" name="password" type="password" autoComplete="current-password" required /></div>
      <button className="button primary" type="submit">Entrar no escritório</button>
    </form>
    <Link className="auth-back-link" href="/login">Voltar ao acesso do cliente</Link>
  </section></main>;
}
