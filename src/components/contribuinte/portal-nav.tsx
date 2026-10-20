"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilePen, FilePlus2, FileText, Home } from "lucide-react";

const itens = [
  { href: "/contribuinte", rotulo: "Página Principal", Icone: Home, ativo: (p: string) => p === "/contribuinte" },
  { href: "/contribuinte/nova", rotulo: "Nova NFS-e", Icone: FilePlus2, ativo: (p: string) => p.startsWith("/contribuinte/nova") || p.startsWith("/contribuinte/dps") },
  { href: "/contribuinte/notas/emitidas", rotulo: "NFS-e Emitidas", Icone: FileText, ativo: (p: string) => p.startsWith("/contribuinte/notas/emitidas") },
  { href: "/contribuinte/notas/rascunhos", rotulo: "Rascunhos", Icone: FilePen, ativo: (p: string) => p.startsWith("/contribuinte/notas/rascunhos") },
] as const;

/** Ícones do topo, como no Portal Contribuinte: o nome aparece ao passar o mouse (e no celular, embaixo). */
export function PortalNav() {
  const pathname = usePathname();
  return <nav className="pc-nav" aria-label="Menu do emissor">
    {itens.map(({ href, rotulo, Icone, ativo }) => (
      <Link key={href} href={href} className={`pc-nav-item${ativo(pathname) ? " ativo" : ""}`} title={rotulo} aria-label={rotulo}>
        <Icone size={21} aria-hidden /><span>{rotulo}</span>
      </Link>
    ))}
  </nav>;
}
