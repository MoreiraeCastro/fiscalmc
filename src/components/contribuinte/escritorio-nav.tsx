"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const itens = [
  ["/admin", "Visão geral"],
  ["/admin/empresas", "Empresas"],
  ["/admin/notas", "Notas de todas as empresas"],
  ["/admin/nao-emitidas", "Não emitidas"],
  ["/admin/pendencias", "Pendências"],
  ["/admin/servicos", "Serviços"],
  ["/admin/tomadores", "Tomadores"],
  ["/admin/cancelamentos", "Cancelamentos"],
  ["/admin/certificados", "Certificados"],
  ["/admin/logs", "Logs"],
  ["/admin/configuracoes", "Configurações"],
] as const;

/** Submenu da aba Escritório (só para os logins do escritório). */
export function EscritorioNav() {
  const pathname = usePathname();
  const ativo = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  return <nav className="pc-subnav" aria-label="Escritório">
    <strong>Escritório</strong>
    {itens.map(([href, rotulo]) => <Link key={href} href={href} className={ativo(href) ? "ativo" : undefined}>{rotulo}</Link>)}
  </nav>;
}
