import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, Inbox, LogOut, type Icon } from "@/components/icons";
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
        {/* Só o escritório vem do portal do grupo; o cliente não tem para onde voltar. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- o portal fica na raiz do domínio, fora do basePath */}
        {escritorio ? <a className="portal-back" href="/" title="Voltar ao portal"><ChevronLeft size={15} aria-hidden />Portal</a> : null}
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

/** Cabeçalho da página (DESIGN.md §6): título e uma linha de contexto à esquerda, ações à direita. */
export function Cabecalho({ titulo, subtitulo, acoes }: { titulo: React.ReactNode; subtitulo?: React.ReactNode; acoes?: React.ReactNode }) {
  return <div className="pc-titulo-linha">
    <div className="pc-titulo-texto">
      <h1 className="pc-titulo">{titulo}</h1>
      {subtitulo ? <p className="pc-subtitulo">{subtitulo}</p> : null}
    </div>
    {acoes ? <div className="pc-acoes">{acoes}</div> : null}
  </div>;
}

/** Estado vazio (DESIGN.md §6): ícone num quadro suave, título, uma linha de instrução e a ação, quando houver. */
export function Vazio({ icone: Icone = Inbox, titulo, texto, acao }: { icone?: Icon; titulo: string; texto?: React.ReactNode; acao?: React.ReactNode }) {
  return <div className="pc-vazio-bloco">
    <span className="pc-vazio-icone"><Icone size={20} aria-hidden /></span>
    <strong>{titulo}</strong>
    {texto ? <p>{texto}</p> : null}
    {acao ? <div className="pc-vazio-acao">{acao}</div> : null}
  </div>;
}

/** Cartão branco com título de bloco (14px/600), como "Informações gerais". */
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
