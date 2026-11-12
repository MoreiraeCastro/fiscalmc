import Link from "next/link";
import { Brand } from "@/components/brand";
import { login } from "./actions";
import { PasswordInput } from "@/components/password-input";

export const metadata = { title: "Entrar" };

const loginErrors:Record<string,string>={invalid_credentials:"CNPJ ou senha inválidos.",rate_limited:"Muitas tentativas. Aguarde um minuto e tente novamente.",configuration:"O acesso está temporariamente indisponível. Entre em contato com o escritório."};
export default async function LoginPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const {error}=await searchParams;
  return <main className="auth-layout">
    <aside className="auth-brand-panel"><Brand inverse/><div><h2>Gestão fiscal com clareza e segurança.</h2><p>Emita e acompanhe suas notas fiscais em um ambiente protegido pelo seu escritório contábil.</p></div><small>Moreira &amp; Castro · Plataforma Fiscal</small></aside>
    <section className="auth-card">
      <Brand />
      <h1>Acesse sua conta</h1>
      <p>Emita e acompanhe suas notas fiscais de serviço.</p>
      {error&&loginErrors[error]&&<p className="alert error" role="alert">{loginErrors[error]}</p>}
      <form action={login}>
        <div className="field"><label htmlFor="cnpj">CNPJ</label><input className="input" id="cnpj" name="cnpj" inputMode="text" autoComplete="username" placeholder="00.000.000/0000-00" required /></div>
        <div className="field"><label htmlFor="password">Senha</label><PasswordInput className="input" id="password" name="password" autoComplete="current-password" required /></div>
        <p className="auth-help">Esqueceu a senha? Solicite a redefinição ao escritório.</p>
        <button className="button primary" type="submit">Entrar</button>
      </form>
      <p className="auth-privacy">Seu acesso é vinculado ao CNPJ da empresa. A identidade técnica permanece interna.</p>
      <Link className="auth-back-link" href="/login/escritorio">Acesso do escritório</Link>
    </section>
  </main>;
}
