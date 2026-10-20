import Link from "next/link";
import { Pencil } from "lucide-react";
import { excluirRascunhoAction } from "@/app/contribuinte/dps/actions";
import { PASSOS } from "@/lib/contribuinte/dps";
import { formatarCompetencia, formatarDataHora, formatarValor, pessoa } from "@/lib/contribuinte/formato";
import type { RascunhoLista } from "@/lib/contribuinte/rascunhos";
import { ExcluirRascunho } from "./excluir-rascunho";

function hrefPasso(item: RascunhoLista) {
  return `/contribuinte/dps/${item.id}/${PASSOS[item.passo - 1].slug}`;
}

/** Rascunhos: Atualização · Competência · Emitida para · Valor · Passo · ações (completa = com valor e exclusão). */
export function TabelaRascunhos({ linhas, completa = true }: { linhas: RascunhoLista[]; completa?: boolean }) {
  return <div className="pc-tabela-rolagem">
    <table className="pc-tabela">
      <thead><tr>{completa ? <th>Atualização</th> : null}<th>Competência</th><th>Emitida para</th>{completa ? <><th className="num">Valor (R$)</th><th>Passo</th></> : null}<th><span className="sr-only">Ações</span></th></tr></thead>
      <tbody>{linhas.map((item) => <tr key={item.id}>
        {completa ? <td className="nowrap">{formatarDataHora(item.atualizadoEm)}</td> : null}
        <td>{formatarCompetencia(item.competencia)}</td>
        <td>{item.tomador ? pessoa(item.tomador.documento, item.tomador.nome) : "Tomador e Intermediário não informados"}</td>
        {completa ? <>
          <td className="num">{item.valorCentavos === null ? "—" : formatarValor(item.valorCentavos)}</td>
          <td><span className="pc-selo neutro">{item.passo}. {PASSOS[item.passo - 1].rotulo}</span></td>
        </> : null}
        <td className="acoes nowrap">
          <Link className="pc-icone-acao" href={hrefPasso(item)} title="Continuar de onde parou" aria-label="Continuar rascunho"><Pencil size={16} aria-hidden /></Link>
          {completa ? <ExcluirRascunho id={item.id} action={excluirRascunhoAction} /> : null}
        </td>
      </tr>)}</tbody>
    </table>
  </div>;
}
