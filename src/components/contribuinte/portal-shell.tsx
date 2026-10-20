import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { BASE_PATH } from "@/lib/base-path";
import type { ContextoContribuinte } from "@/lib/contribuinte/contexto";
import { formatarDocumento } from "@/lib/contribuinte/formato";
import { PortalNav } from "./portal-nav";
import { SeletorEmpresa } from "./seletor-empresa";

/** Moldura do emissor no formato do Portal Contribuinte: topo fixo com ícones, conteúdo em cartões, rodapé. */
export function PortalShell({ contexto, children }: { contexto: ContextoContribuinte; children: React.ReactNode }) {
  const { empresa, escritorio, empresas } = contexto;
  const trocar = escritorio || empresas.length > 1;
  return <div className="pc">
    <header className="pc-topo">
      <div className="pc-topo-in">
        <Link href="/contribuinte" className="pc-marca" aria-label="Página Principal">
          <Image src={`${BASE_PATH}/icon-192.png`} width={38} height={38} alt="" priority />
          <span><strong>Moreira &amp; Castro</strong><small>Portal Contribuinte · NFS-e</small></span>
        </Link>
        <PortalNav escritorio={escritorio} />
        <div className="pc-perfil">
          {trocar
            ? <SeletorEmpresa atual={empresa} empresas={empresas.map(({ id, razaoSocial, cnpj, emissaoBloqueada, podeEmitir }) => ({ id, razaoSocial, cnpj, emissaoBloqueada, podeEmitir }))} />
            : empresa ? <span className="pc-empresa"><span><strong>{empresa.razaoSocial}</strong><small>{formatarDocumento(empresa.cnpj)}</small></span></span> : null}
          <form action={logout}><button type="submit" className="pc-icone" title="Sair com segurança" aria-label="Sair com segurança"><LogOut size={19} aria-hidden /></button></form>
        </div>
      </div>
    </header>
    <div className="pc-corpo">{children}</div>
    <footer className="pc-rodape">Moreira &amp; Castro · Emissor de NFS-e no padrão nacional · {contexto.usuario}</footer>
  </div>;
}

/** Trilha abaixo do topo: "Home :: NFS-e :: Emitidas". */
export function Trilha({ itens }: { itens: (string | [string, string])[] }) {
  return <nav className="pc-trilha" aria-label="Você está em">
    <Link href="/contribuinte">Home</Link>
    {itens.map((item) => {
      const [rotulo, href] = typeof item === "string" ? [item, null] : item;
      return <span key={rotulo}><span aria-hidden> :: </span>{href ? <Link href={href}>{rotulo}</Link> : rotulo}</span>;
    })}
  </nav>;
}

/** Cartão branco com título verde em caixa alta, como "INFORMAÇÕES GERAIS". */
export function Cartao({ titulo, acoes, children, className = "" }: { titulo?: string; acoes?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`pc-cartao ${className}`}>
    {titulo || acoes ? <header className="pc-cartao-topo">{titulo ? <h2>{titulo}</h2> : <span />}{acoes}</header> : null}
    {children}
  </section>;
}

/** Caixa de aviso (azul = informação, amarela = atenção, verde = sucesso). */
export function Aviso({ tipo = "info", children }: { tipo?: "info" | "alerta" | "sucesso" | "erro"; children: React.ReactNode }) {
  return <div className={`pc-aviso ${tipo}`} role={tipo === "erro" || tipo === "alerta" ? "alert" : undefined}>{children}</div>;
}
