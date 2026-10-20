import Link from "next/link";
import { Eye } from "lucide-react";
import { apiUrl } from "@/lib/base-path";
import { rotasLegadas } from "@/lib/contribuinte/contexto";
import { formatarCompetencia, formatarDataHora, formatarValor, pessoa, situacaoNota } from "@/lib/contribuinte/formato";
import type { NotaLinha } from "@/lib/contribuinte/notas";
import { MenuNota } from "./menu-nota";

export function SituacaoNota({ status }: { status: string }) {
  const situacao = situacaoNota(status);
  return <span className={`pc-situacao ${situacao.tom}`}><i aria-hidden />{situacao.rotulo}</span>;
}

/** Tabela "NFS-e Emitidas": Geração · Emitida para · Competência · Município Emissor · Preço Serviço · Situação · ⋮ */
export function TabelaNotas({ linhas, municipio, escritorio, empresaId }: { linhas: NotaLinha[]; municipio: string; escritorio: boolean; empresaId: string }) {
  const rotas = rotasLegadas(escritorio, empresaId);
  return <div className="pc-tabela-rolagem">
    <table className="pc-tabela">
      <thead><tr><th>Geração</th><th>Emitida para</th><th>Competência</th><th>Município Emissor</th><th className="num">Preço Serviço (R$)</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
      <tbody>{linhas.map((nota) => {
        const gerada = nota.status === "ISSUED" || nota.status === "CANCELLED";
        return <tr key={nota.id}>
          <td className="nowrap">{formatarDataHora(nota.geracao)}{nota.teste ? <em className="pc-selo neutro" title="Ambiente de Produção Restrita, sem valor fiscal">teste</em> : null}</td>
          <td>{pessoa(nota.emitidaPara.documento, nota.emitidaPara.nome)}</td>
          <td>{formatarCompetencia(nota.competencia)}</td>
          <td>{municipio}</td>
          <td className="num">{formatarValor(nota.valorCentavos)}</td>
          <td><SituacaoNota status={nota.status} /></td>
          <td className="acoes"><MenuNota visualizar={rotas.visualizar(nota.id)} xml={apiUrl(rotas.documento(nota.id, "NFSE_XML"))} danfse={apiUrl(rotas.documento(nota.id, "PDF"))} gerada={gerada} /></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

/** Versão curta da Página Principal: Geração · Emitida para · Valor · 👁 */
export function TabelaUltimas({ linhas, escritorio, empresaId }: { linhas: NotaLinha[]; escritorio: boolean; empresaId: string }) {
  const rotas = rotasLegadas(escritorio, empresaId);
  return <div className="pc-tabela-rolagem">
    <table className="pc-tabela">
      <thead><tr><th>Geração</th><th>Emitida para</th><th className="num">Valor (R$)</th><th><span className="sr-only">Visualizar</span></th></tr></thead>
      <tbody>{linhas.map((nota) => <tr key={nota.id}>
        <td className="nowrap">{formatarDataHora(nota.geracao)}</td>
        <td>{pessoa(nota.emitidaPara.documento, nota.emitidaPara.nome)}</td>
        <td className="num">{formatarValor(nota.valorCentavos)}</td>
        <td className="acoes"><Link className="pc-icone-acao" href={rotas.visualizar(nota.id)} title="Visualizar" aria-label="Visualizar"><Eye size={17} aria-hidden /></Link></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
