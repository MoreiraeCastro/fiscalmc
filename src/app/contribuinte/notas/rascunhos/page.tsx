import Link from "next/link";
import { FilePlus2 } from "@/components/icons";
import { Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { TabelaRascunhos } from "@/components/contribuinte/tabela-rascunhos";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { listarRascunhos } from "@/lib/contribuinte/rascunhos";

export const metadata = { title: "Rascunhos" };

export default async function RascunhosPage() {
  const { empresa } = await exigirEmpresa();
  const rascunhos = await listarRascunhos(empresa.id);
  return <>
    <Trilha itens={["NFS-e", "Rascunhos"]} />
    <div className="pc-titulo-linha">
      <h1 className="pc-titulo">Rascunhos</h1>
      <div className="pc-acoes"><Link className="pc-botao" href="/contribuinte/nova"><FilePlus2 size={17} aria-hidden />Nova NFS-e</Link></div>
    </div>
    <Cartao>
      {rascunhos.length ? <TabelaRascunhos linhas={rascunhos} />
        : <p className="pc-vazio">Nenhum rascunho.</p>}
      {rascunhos.length ? <p className="pc-paginacao"><span>Total de {rascunhos.length} {rascunhos.length === 1 ? "registro" : "registros"}</span></p> : null}
    </Cartao>
  </>;
}
