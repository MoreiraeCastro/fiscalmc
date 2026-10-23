import Link from "next/link";
import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { MenuNota } from "@/components/contribuinte/menu-nota";
import { BotaoAtualizarRecebidas } from "@/components/contribuinte/botao-atualizar-recebidas";
import { apiUrl } from "@/lib/base-path";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { listarRecebidas, situacaoLeitura } from "@/lib/contribuinte/recebidas";
import { POR_PAGINA } from "@/lib/contribuinte/notas";
import { formatarCompetencia, formatarDataHora, formatarValor, pessoa } from "@/lib/contribuinte/formato";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";

export const metadata = { title: "NFS-e Recebidas" };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** NFS-e Recebidas, como /Notas/Recebidas do Emissor Nacional, mas sem o limite de 30 dias (vem da distribuição do ADN). */
export default async function RecebidasPage({ searchParams }: { searchParams: Promise<{ q?: string; de?: string; ate?: string; p?: string }> }) {
  const [{ empresa }, filtros] = await Promise.all([exigirEmpresa(), searchParams]);
  const de = filtros.de && DATA.test(filtros.de) ? filtros.de : undefined;
  const ate = filtros.ate && DATA.test(filtros.ate) ? filtros.ate : undefined;
  const [{ linhas, total, pagina }, leitura] = await Promise.all([
    listarRecebidas({ empresaId: empresa.id, busca: filtros.q, de, ate, pagina: Number(filtros.p) || 1 }),
    situacaoLeitura(empresa.id),
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const filtrando = Boolean(filtros.q?.trim() || de || ate);
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (filtros.q) params.set("q", filtros.q);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    if (p > 1) params.set("p", String(p));
    const texto = params.toString();
    return `/contribuinte/notas/recebidas${texto ? `?${texto}` : ""}`;
  };
  return <>
    <Trilha itens={["NFS-e", "Recebidas"]} />
    <div className="pc-titulo-linha">
      <h1 className="pc-titulo">NFS-e Recebidas</h1>
      <div className="pc-acoes"><BotaoAtualizarRecebidas /></div>
    </div>
    <Cartao>
      <form className="pc-filtros" method="get">
        <label className="largo"><span>Pesquisar pessoa física ou jurídica</span><input name="q" defaultValue={filtros.q} placeholder="Nome, CPF ou CNPJ do prestador" /></label>
        <label><span>Data Inicial</span><input type="date" name="de" defaultValue={de} /></label>
        <label><span>Data Final</span><input type="date" name="ate" defaultValue={ate} /></label>
        <div className="pc-filtros-botoes"><button className="pc-botao" type="submit">Filtrar</button>{filtrando ? <Link className="pc-link" href="/contribuinte/notas/recebidas">Limpar</Link> : null}</div>
      </form>
      {!leitura?.last_sync_at
        ? <Aviso>As notas recebidas vêm do Ambiente de Dados Nacional (ADN), lidas com o certificado A1 da empresa. A primeira leitura traz todo o histórico; clique em <strong>Atualizar agora</strong> para começar.</Aviso>
        : <Aviso>Notas em que a empresa é tomadora ou intermediária, lidas do ADN. Última leitura: <strong>{formatarDataHora(leitura.last_sync_at)}</strong>; a próxima é automática (de 2 em 2 horas).{leitura.last_status === "FALHA" ? <> A última tentativa falhou: {leitura.last_error}</> : null}</Aviso>}
      {linhas.length
        ? <div className="pc-tabela-rolagem">
          <table className="pc-tabela">
            <thead><tr><th>Geração</th><th>Emitida por</th><th>Competência</th><th>Município Emissor</th><th className="num">Preço Serviço (R$)</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{linhas.map((nota) => <tr key={nota.id}>
              <td className="nowrap">{formatarDataHora(nota.geracao)}{nota.papel === "INTERMEDIARIO" ? <em className="pc-selo neutro" title="A empresa aparece como intermediária">intermediário</em> : null}</td>
              <td>{pessoa(nota.emitidaPor.documento, nota.emitidaPor.nome)}</td>
              <td>{formatarCompetencia(nota.competencia)}</td>
              <td>{nota.municipioEmissor ? nomeMunicipio(nota.municipioEmissor) : "—"}</td>
              <td className="num">{nota.valorCentavos === null ? "—" : formatarValor(nota.valorCentavos)}</td>
              <td><span className={`pc-situacao ${nota.cancelada ? "erro" : "ok"}`}><i aria-hidden />{nota.cancelada ? "Cancelada" : "NFS-e Gerada"}</span></td>
              <td className="acoes"><MenuNota visualizar={`/contribuinte/notas/recebidas/${nota.id}`} xml={apiUrl(`/api/contribuinte/recebidas/${nota.id}/xml`)} danfse={apiUrl(`/api/contribuinte/recebidas/${nota.id}/pdf`)} gerada emitida={false} /></td>
            </tr>)}</tbody>
          </table>
        </div>
        : <p className="pc-vazio">{filtrando ? "Nenhuma NFS-e recebida com esses filtros." : leitura?.last_sync_at ? "Nenhuma NFS-e recebida por esta empresa no ADN." : "Ainda não houve leitura no ADN para esta empresa."}</p>}
      <footer className="pc-paginacao">
        <span>Total de {total} {total === 1 ? "registro" : "registros"}</span>
        {paginas > 1 ? <span className="pc-paginas">
          {pagina > 1 ? <Link href={link(pagina - 1)}>‹ Anterior</Link> : <span className="desativado">‹ Anterior</span>}
          <span>Página {pagina} de {paginas}</span>
          {pagina < paginas ? <Link href={link(pagina + 1)}>Próxima ›</Link> : <span className="desativado">Próxima ›</span>}
        </span> : null}
      </footer>
    </Cartao>
  </>;
}
