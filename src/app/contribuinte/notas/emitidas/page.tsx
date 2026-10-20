import Link from "next/link";
import { FilePlus2, RotateCw } from "lucide-react";
import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { TabelaNotas } from "@/components/contribuinte/tabela-notas";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { listarEmitidas, POR_PAGINA } from "@/lib/contribuinte/notas";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";

export const metadata = { title: "NFS-e Emitidas" };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function EmitidasPage({ searchParams }: { searchParams: Promise<{ q?: string; de?: string; ate?: string; p?: string }> }) {
  const [{ empresa, escritorio }, filtros] = await Promise.all([exigirEmpresa(), searchParams]);
  const de = filtros.de && DATA.test(filtros.de) ? filtros.de : undefined;
  const ate = filtros.ate && DATA.test(filtros.ate) ? filtros.ate : undefined;
  const { linhas, total, pagina } = await listarEmitidas({ empresaId: empresa.id, busca: filtros.q, de, ate, pagina: Number(filtros.p) || 1 });
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const filtrando = Boolean(filtros.q?.trim() || de || ate);
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (filtros.q) params.set("q", filtros.q);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    if (p > 1) params.set("p", String(p));
    const texto = params.toString();
    return `/contribuinte/notas/emitidas${texto ? `?${texto}` : ""}`;
  };
  return <>
    <Trilha itens={["NFS-e", "Emitidas"]} />
    <div className="pc-titulo-linha">
      <h1 className="pc-titulo">NFS-e Emitidas</h1>
      <div className="pc-acoes">
        <Link className="pc-botao" href="/contribuinte/nova"><FilePlus2 size={17} aria-hidden />Nova NFS-e</Link>
        <Link className="pc-botao secundario" href={link(pagina)} title="Recarregar lista"><RotateCw size={16} aria-hidden />Recarregar lista</Link>
      </div>
    </div>
    <Cartao>
      <form className="pc-filtros" method="get">
        <label className="largo"><span>Pesquisar pessoa física ou jurídica</span><input name="q" defaultValue={filtros.q} placeholder="Nome, CPF ou CNPJ do tomador" /></label>
        <label><span>Data Inicial</span><input type="date" name="de" defaultValue={de} /></label>
        <label><span>Data Final</span><input type="date" name="ate" defaultValue={ate} /></label>
        <div className="pc-filtros-botoes"><button className="pc-botao" type="submit">Filtrar</button>{filtrando ? <Link className="pc-link" href="/contribuinte/notas/emitidas">Limpar</Link> : null}</div>
      </form>
      {!filtrando ? <Aviso>São exibidas todas as notas da empresa, da mais recente para a mais antiga. Para um período, informe as datas e clique em <strong>Filtrar</strong>.</Aviso> : null}
      {linhas.length
        ? <TabelaNotas linhas={linhas} municipio={nomeMunicipio(empresa.municipio)} escritorio={escritorio} empresaId={empresa.id} />
        : <p className="pc-vazio">{filtrando ? "Nenhuma NFS-e encontrada com esses filtros." : "Nenhuma NFS-e emitida ainda para esta empresa."}</p>}
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
