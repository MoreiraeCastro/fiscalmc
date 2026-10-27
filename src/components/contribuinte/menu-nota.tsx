"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Ban, CopyPlus, Download, Eye, EllipsisVertical, FileCode2, Repeat2 } from "lucide-react";
import { emitirDeNovoAction } from "@/app/contribuinte/nfse/actions";

/** Menu ⋮ da linha, com as mesmas opções do Emissor Nacional. */
export function MenuNota({ visualizar, xml, danfse, gerada, emitida, notaId }: { visualizar: string; xml: string; danfse: string; gerada: boolean; emitida: boolean; notaId?: string }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: MouseEvent) => { if (!raiz.current?.contains(evento.target as Node)) setAberto(false); };
    const esc = (evento: KeyboardEvent) => { if (evento.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);
  return <div className="pc-menu" ref={raiz}>
    <button type="button" className="pc-menu-botao" aria-haspopup="menu" aria-expanded={aberto} aria-label="Ações da nota" onClick={() => setAberto((valor) => !valor)}><EllipsisVertical size={18} aria-hidden /></button>
    {aberto ? <div className="pc-menu-lista" role="menu">
      <Link role="menuitem" href={visualizar}><Eye size={16} aria-hidden />Visualizar</Link>
      {emitida && notaId ? <form action={emitirDeNovoAction}><input type="hidden" name="notaId" value={notaId} /><button type="submit" role="menuitem"><CopyPlus size={16} aria-hidden />Emitir de novo</button></form> : null}
      {emitida ? <Link role="menuitem" href={visualizar}><Repeat2 size={16} aria-hidden />Substituir</Link> : null}
      {emitida ? <Link role="menuitem" href={`${visualizar}?acao=cancelar`}><Ban size={16} aria-hidden />Cancelar NFS-e</Link> : null}
      {gerada ? <a role="menuitem" href={xml}><FileCode2 size={16} aria-hidden />Download XML</a> : null}
      {gerada ? <a role="menuitem" href={danfse}><Download size={16} aria-hidden />Download DANFS-e</a> : null}
    </div> : null}
  </div>;
}
