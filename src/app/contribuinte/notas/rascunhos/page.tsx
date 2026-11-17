import Link from "next/link";
import { FilePen, FilePlus2 } from "@/components/icons";
import { Cabecalho, Cartao, Trilha, Vazio } from "@/components/contribuinte/portal-shell";
import { TabelaRascunhos } from "@/components/contribuinte/tabela-rascunhos";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { listarRascunhos } from "@/lib/contribuinte/rascunhos";

export const metadata = { title: "Rascunhos" };

export default async function RascunhosPage() {
  const { empresa } = await exigirEmpresa();
  const rascunhos = await listarRascunhos(empresa.id);
  return <>
    <Trilha itens={["NFS-e", "Rascunhos"]} />
    <Cabecalho titulo="Rascunhos" subtitulo="Notas começadas e ainda não emitidas."
      acoes={<Link className="pc-botao" href="/contribuinte/nova"><FilePlus2 size={16} aria-hidden />Nova NFS-e</Link>} />
    <Cartao>
      {rascunhos.length ? <TabelaRascunhos linhas={rascunhos} />
        : <Vazio icone={FilePen} titulo="Nenhum rascunho" texto="Ao sair de uma emissão sem emitir, a nota fica salva aqui." />}
      {rascunhos.length ? <p className="pc-paginacao"><span>Total de {rascunhos.length} {rascunhos.length === 1 ? "registro" : "registros"}</span></p> : null}
    </Cartao>
  </>;
}
