"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, Search } from "lucide-react";
import { escolherEmpresa } from "@/app/contribuinte/empresa/actions";
import { formatarDocumento } from "@/lib/contribuinte/formato";

export type EmpresaOpcao = { id: string; razaoSocial: string; cnpj: string; emissaoBloqueada: boolean; podeEmitir: boolean };

/** Seletor de empresa no topo: menu suspenso com busca (o Fiscal troca de empresa sem sair da tela). */
export function SeletorEmpresa({ empresas, atual }: { empresas: EmpresaOpcao[]; atual: EmpresaOpcao | null }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: MouseEvent) => { if (!raiz.current?.contains(evento.target as Node)) setAberto(false); };
    const esc = (evento: KeyboardEvent) => { if (evento.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);
  const lista = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const digitos = termo.replace(/\D/g, "");
    return termo ? empresas.filter((e) => e.razaoSocial.toLocaleLowerCase("pt-BR").includes(termo) || (digitos.length >= 3 && e.cnpj.includes(digitos))) : empresas;
  }, [busca, empresas]);
  // Depois de trocar, fica na mesma área (nota e rascunho são de uma empresa só: esses voltam para a lista).
  const voltar = pathname.startsWith("/contribuinte/nfse") || pathname.startsWith("/contribuinte/dps") ? "/contribuinte" : pathname.startsWith("/contribuinte") ? pathname : "/contribuinte";

  return <div className="pc-seletor" ref={raiz}>
    <button type="button" className={`pc-empresa${atual ? "" : " vazia"}`} aria-haspopup="listbox" aria-expanded={aberto} onClick={() => { setAberto((v) => !v); setBusca(""); }}>
      {atual ? <span><strong>{atual.razaoSocial}</strong><small>{formatarDocumento(atual.cnpj)}</small></span> : "Escolher empresa"}
      <ChevronDown size={16} aria-hidden />
    </button>
    {aberto ? <div className="pc-seletor-painel">
      <label className="pc-seletor-busca"><Search size={15} aria-hidden /><input autoFocus placeholder="Razão social ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Pesquisar empresa" /></label>
      <ul role="listbox" aria-label="Empresas">
        {lista.slice(0, 200).map((empresa) => <li key={empresa.id}>
          <form action={escolherEmpresa}>
            <input type="hidden" name="empresa" value={empresa.id} />
            <input type="hidden" name="voltar" value={voltar} />
            <button type="submit" role="option" aria-selected={atual?.id === empresa.id} className={atual?.id === empresa.id ? "atual" : undefined}>
              <span><strong>{empresa.razaoSocial}</strong><small>{formatarDocumento(empresa.cnpj)}{empresa.emissaoBloqueada ? " · emissão bloqueada" : !empresa.podeEmitir ? " · só consulta" : ""}</small></span>
              {atual?.id === empresa.id ? <Check size={16} aria-hidden /> : null}
            </button>
          </form>
        </li>)}
        {!lista.length ? <li className="pc-seletor-vazio">Nenhuma empresa encontrada.</li> : null}
      </ul>
      {lista.length > 200 ? <p className="pc-seletor-vazio">Mostrando 200 de {lista.length}. Refine a busca.</p> : null}
    </div> : null}
  </div>;
}
