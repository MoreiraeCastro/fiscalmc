import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";

export const metadata = { title: "Rascunhos" };

export default async function RascunhosPage() {
  await exigirEmpresa();
  return <>
    <Trilha itens={["NFS-e", "Rascunhos"]} />
    <div className="pc-titulo-linha">
      <h1 className="pc-titulo">Rascunhos</h1>
      <div className="pc-acoes"><Link className="pc-botao" href="/contribuinte/nova"><FilePlus2 size={17} aria-hidden />Nova NFS-e</Link></div>
    </div>
    <Cartao>
      <div className="pc-tabela-rolagem">
        <table className="pc-tabela">
          <thead><tr><th>Atualização</th><th>Competência</th><th>Emitida para</th><th className="num">Valor (R$)</th><th>Passo</th><th><span className="sr-only">Ações</span></th></tr></thead>
        </table>
      </div>
      <Aviso>A emissão de uma nova NFS-e é dividida em 4 passos: <strong>Pessoas</strong>, <strong>Serviço</strong>, <strong>Valores</strong> e <strong>Emitir NFS-e</strong>. Ao passar para o próximo passo, o que já foi preenchido fica salvo e aparece aqui, para você continuar de onde parou.</Aviso>
    </Cartao>
  </>;
}
