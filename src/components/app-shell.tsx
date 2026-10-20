import Link from "next/link";
import { Suspense } from "react";
import { BriefcaseBusiness, Building2, CircleAlert, FileCheck2, FilePlus2, FileText, Home, LogOut, Menu, ScrollText, Settings, ShieldCheck, UserRound, UsersRound, XCircle } from "lucide-react";
import { Brand } from "./brand";
import { ShellNavLink } from "./shell-nav-link";
import { getShellIdentity } from "@/lib/auth/session";
import { logout } from "@/app/login/actions";

type ShellProps = { children: React.ReactNode; admin?: boolean };

const clientNav = [
  ["home", "/app", "Início", Home],
  ["issue", "/app/emitir", "Emitir NFS-e", FilePlus2],
  ["invoices", "/app/notas", "Notas fiscais", FileText],
  ["customers", "/app/tomadores", "Tomadores", UsersRound],
  ["services", "/app/servicos", "Meus serviços", BriefcaseBusiness],
  ["profile", "/app/perfil", "Perfil", UserRound]
] as const;
const adminNav = [
  ["home", "/admin", "Visão geral", Home],
  ["companies", "/admin/empresas", "Empresas", Building2],
  ["emissions", "/admin/emissoes", "Emissões", FilePlus2],
  ["invoices", "/admin/notas", "Notas fiscais", FileText],
  ["pending", "/admin/pendencias", "Pendências", CircleAlert],
  ["services", "/admin/servicos", "Serviços", BriefcaseBusiness],
  ["customers", "/admin/tomadores", "Tomadores", UsersRound],
  ["cancellations", "/admin/cancelamentos", "Cancelamentos", XCircle],
  ["certificates", "/admin/certificados", "Certificados", ShieldCheck],
  ["logs", "/admin/logs", "Logs", ScrollText],
  ["settings", "/admin/configuracoes", "Configurações", Settings]
] as const;
const adminGroups = [
  ["Principal", adminNav.slice(0, 4)],
  ["Operação", adminNav.slice(4, 8)],
  ["Administração", adminNav.slice(8)],
] as const;

export function AppShell({ children, admin = false }: ShellProps) {
  const nav = admin ? adminNav : clientNav;
  const switchHref = admin ? "/app" : "/admin";
  const switchLabel = admin ? "Área do cliente" : "Área do escritório";
  const SwitchIcon = admin ? UserRound : Building2;
  return <div className="shell">
    <aside className={`sidebar${admin ? " admin" : ""}`}>
      <Link href={admin ? "/admin" : "/app"} aria-label="Página inicial"><Brand inverse={admin} /></Link>
      <nav className="nav" aria-label="Navegação principal">{admin ? adminGroups.map(([title,items])=><section className="nav-group" key={title}><span>{title}</span>{items.map(([key,href,label,Icon])=><ShellNavLink key={key} itemKey={key} href={href} className="nav-link"><Icon size={18} aria-hidden />{label}</ShellNavLink>)}</section>) : nav.map(([key, href, label, Icon]) => <ShellNavLink key={key} itemKey={key} href={href} className="nav-link"><Icon size={20} aria-hidden />{label}</ShellNavLink>)}</nav>
      <div className="sidebar-bottom">
        {admin ? <div className="sidebar-ctas">
          <Link className="button primary" href="/admin/emissoes"><FileCheck2 size={18} aria-hidden />Emitir NFS-e</Link>
          <Link className="button secondary" href="/admin/empresas/nova"><Building2 size={18} aria-hidden />Nova empresa</Link>
          <Link className="button secondary" href="/contribuinte"><FileText size={18} aria-hidden />Portal Contribuinte</Link>
        </div> : null}
        {admin?<Link className="nav-link role-switch" href={switchHref}><SwitchIcon size={19} aria-hidden />{switchLabel}</Link>:<Suspense fallback={null}><OfficeSwitch className="nav-link role-switch" href={switchHref} label={switchLabel} iconSize={19}/></Suspense>}
        <form action={logout}><button className="nav-link" type="submit"><LogOut size={19} aria-hidden />Sair</button></form>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <Link className="mobile-brand" href={admin ? "/admin" : "/app"} aria-label={admin ? "Início da área do escritório" : "Início da área do cliente"}><Brand compact /></Link>
        <span className="topbar-context">{admin ? "Operação fiscal" : "Portal do cliente"}</span>
        <div className="topbar-actions">
        {admin?<Link className="mobile-role-switch" href={switchHref} aria-label={switchLabel}><SwitchIcon size={18} aria-hidden /><span>Cliente</span></Link>:<Suspense fallback={null}><OfficeSwitch className="mobile-role-switch" href={switchHref} label={switchLabel} iconSize={18} compact/></Suspense>}
        <Suspense fallback={<IdentityFallback admin={admin}/>}><ShellIdentity admin={admin}/></Suspense>
      </div></header>
      {children}
    </main>
    <nav className={`mobile-nav${admin ? " admin" : ""}`} aria-label={admin ? "Navegação do escritório" : "Navegação do cliente"}>
      {(admin ? adminNav.slice(0, 4) : nav.slice(0, 5)).map(([key, href, label, Icon]) => <ShellNavLink key={key} itemKey={key} href={href}><Icon size={22} aria-hidden /><span>{mobileLabel(key, label)}</span></ShellNavLink>)}
      {admin ? <details className="mobile-more"><summary><Menu size={22} aria-hidden /><span>Mais</span></summary><div className="mobile-more-drawer"><div><strong>Mais opções</strong><small>Operação e administração</small></div>{adminNav.slice(4).map(([key, href, label, Icon]) => <ShellNavLink key={key} itemKey={key} href={href} className="mobile-more-link"><Icon size={18} aria-hidden />{label}</ShellNavLink>)}<form action={logout}><button className="mobile-more-link" type="submit"><LogOut size={18} aria-hidden />Sair</button></form></div></details> : null}
    </nav>
  </div>;
}

async function OfficeSwitch({className,href,label,iconSize,compact=false}:{className:string;href:string;label:string;iconSize:number;compact?:boolean}){
  const identity=await getShellIdentity();
  if(!identity?.canAccessOffice)return null;
  return <Link className={className} href={href} aria-label={label}><Building2 size={iconSize} aria-hidden /><span>{compact?"Escritório":label}</span></Link>;
}

async function ShellIdentity({admin}:{admin:boolean}){
  const identity=await getShellIdentity();
  const displayName=identity?.displayName??"Usuário";
  return <div className="identity"><span className="avatar" aria-hidden>{displayName.slice(0,1).toUpperCase()}</span><span><strong>{displayName}</strong><small>{admin ? "Escritório" : "Área do cliente"}</small></span></div>;
}

function IdentityFallback({admin}:{admin:boolean}){
  return <div className="identity identity-loading" aria-label="Carregando perfil"><span className="organization">{admin ? "Escritório" : "Área do cliente"}</span><span className="avatar" aria-hidden>…</span><span className="identity-name-skeleton"/></div>;
}

function mobileLabel(key: string, label: string) {
  if (key === "invoices") return "Notas";
  if (key === "issue") return "Emitir";
  if (key === "companies") return "Empresas";
  if (key === "settings") return "Ajustes";
  if (key === "certificates") return "A1";
  if (key === "emissions") return "Emitir";
  if (key === "services") return "Serviços";
  if (key === "pending") return "Pendências";
  if (key === "cancellations") return "Cancelar";
  if (label === "Visão geral") return "Visão";
  return label;
}
