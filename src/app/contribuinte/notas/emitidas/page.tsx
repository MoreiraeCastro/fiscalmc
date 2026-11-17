import Link from "next/link";
import { FilePlus2, FileText, RotateCw, Search } from "@/components/icons";
import { Cabecalho, Cartao, Trilha, Vazio } from "@/components/contribuinte/portal-shell";
import { TabelaNotas } from "@/components/contribuinte/tabela-notas";
import { SeletorCompetencia } from "@/components/contribuinte/seletor-competencia";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { listarEmitidas, POR_PAGINA } from "@/lib/contribuinte/notas";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";

export const metadata = { title: "NFS-e Emitidas" };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function EmitidasPage({ searchParams }: { searchParams: Promise<{ q?: string; de?: string; ate?: string; competencia?: string; p?: string }> }) {
  const [{ empresa, escritorio }, filtros] = await Promise.all([exigirEmpresa(), searchParams]);
  const de = filtros.de && DATA.test(filtros.de) ? filtros.de : undefined;
  const ate = filtros.ate && DATA.test(filtros.ate) ? filtros.ate : undefined;
  const competencia = filtros.competencia && /^\d{4}-(0[1-9]|1[0-2])$/.test(filtros.competencia) ? filtros.competencia : undefined;
  const mesAtual = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
  const { linhas, total, pagina } = await listarEmitidas({ empresaId: empresa.id, busca: filtros.q, de, ate, competencia, pagina: Number(filtros.p) || 1 });
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const filtrando = Boolean(filtros.q?.trim() || de || ate || competencia);
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (filtros.q) params.set("q", filtros.q);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    if (competencia) params.set("competencia", competencia);
    if (p > 1) params.set("p", String(p));
    const texto = params.toString();
    return `/contribuinte/notas/emitidas${texto ? `?${texto}` : ""}`;
  };
  return <>
    <Trilha itens={["NFS-e", "Emitidas"]} />
    <Cabecalho titulo="NFS-e Emitidas" subtitulo="Notas emitidas pela empresa, com filtro por tomador, período e competência."
      acoes={<>
        <Link className="pc-botao secundario" href={link(pagina)} title="Recarregar lista"><RotateCw size={16} aria-hidden />Recarregar lista</Link>
        <Link className="pc-botao" href="/contribuinte/nova"><FilePlus2 size={16} aria-hidden />Nova NFS-e</Link>
      </>} />
    <Cartao>
      <form className="pc-filtros" method="get">
        <label className="largo"><span>Pesquisar pessoa física ou jurídica</span><input name="q" defaultValue={filtros.q} placeholder="Nome, CPF ou CNPJ do tomador" /></label>
        <label><span>Data Inicial</span><input type="date" name="de" defaultValue={de} /></label>
        <label><span>Data Final</span><input type="date" name="ate" defaultValue={ate} /></label>
        <div className="pc-filtro-competencia"><span>Competência</span><SeletorCompetencia name="competencia" inicial={competencia ?? ""} limite={mesAtual} opcional /></div>
        <div className="pc-filtros-botoes"><button className="pc-botao" type="submit">Filtrar</button>{filtrando ? <Link className="pc-link" href="/contribuinte/notas/emitidas">Limpar</Link> : null}</div>
      </form>
      {linhas.length
        ? <TabelaNotas linhas={linhas} municipio={nomeMunicipio(empresa.municipio)} escritorio={escritorio} />
        : filtrando
          ? <Vazio icone={Search} titulo="Nenhuma NFS-e encontrada com esses filtros" texto="Ajuste os filtros ou limpe a busca para ver todas as notas."
            acao={<Link className="pc-botao secundario" href="/contribuinte/notas/emitidas">Limpar filtros</Link>} />
          : <Vazio icone={FileText} titulo="Nenhuma NFS-e emitida ainda para esta empresa" texto="A primeira nota emitida aparece aqui."
            acao={<Link className="pc-botao" href="/contribuinte/nova"><FilePlus2 size={16} aria-hidden />Nova NFS-e</Link>} />}
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
