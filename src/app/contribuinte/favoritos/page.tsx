import Link from "next/link";
import { Pencil, Plus, Play, Star } from "@/components/icons";
import { Aviso, Cabecalho, Cartao, Trilha, Vazio } from "@/components/contribuinte/portal-shell";
import { ExcluirRascunho } from "@/components/contribuinte/excluir-rascunho";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { servicosProntos } from "@/lib/contribuinte/emissao";
import { FAVORITOS_MAX, listarFavoritos } from "@/lib/contribuinte/favoritos";
import { formatarValor, pessoa } from "@/lib/contribuinte/formato";
import { excluirFavoritoAction, usarFavoritoAction } from "./actions";

export const metadata = { title: "Serviços Favoritos" };

export default async function FavoritosPage({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const [{ empresa }, { salvo }] = await Promise.all([exigirEmpresa(), searchParams]);
  const [favoritos, servicos] = await Promise.all([listarFavoritos(empresa.id), servicosProntos(empresa.id)]);
  const nomeServico = (id: string) => {
    const item = servicos.find((s) => s.id === id);
    return item ? `${item.codigo ? `${item.codigo} - ` : ""}${item.descricaoCodigo ?? item.nome}` : "Serviço indisponível";
  };
  const cheio = favoritos.length >= FAVORITOS_MAX;
  return <>
    <Trilha itens={["Serviços Favoritos"]} />
    <Cabecalho titulo="Serviços Favoritos" subtitulo="Serviço, tomador e valor prontos para emitir com um clique."
      acoes={empresa.podeEmitir ? cheio
        ? <span className="pc-nota">Limite de {FAVORITOS_MAX} favoritos atingido.</span>
        : <Link className="pc-botao" href="/contribuinte/favoritos/novo"><Plus size={16} aria-hidden />Novo Serviço Favorito</Link> : null} />
    {salvo ? <Aviso tipo="sucesso">Serviço favorito salvo.</Aviso> : null}
    <Cartao>
      {favoritos.length ? <div className="pc-tabela-rolagem"><table className="pc-tabela">
        <thead><tr><th>Nome</th><th>Serviço</th><th>Tomador</th><th className="num">Valor (R$)</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{favoritos.map((fav) => <tr key={fav.id}>
          <td><strong>{fav.nome}</strong>{fav.dados.informarIbsCbs ? <em className="pc-selo neutro">IBS/CBS</em> : null}</td>
          <td>{nomeServico(fav.dados.servico.modeloId)}</td>
          <td>{fav.dados.semTomador ? "Não informado" : fav.dados.tomador ? pessoa(fav.dados.tomador.documento, fav.dados.tomador.nome) : <span className="pc-mudo">Escolher na emissão</span>}</td>
          <td className="num">{fav.dados.valorCentavos ? formatarValor(fav.dados.valorCentavos) : "—"}</td>
          <td className="acoes nowrap">{empresa.podeEmitir ? <>
            <form action={usarFavoritoAction} className="pc-inline"><input type="hidden" name="id" value={fav.id} /><button type="submit" className="pc-botao pequeno" title="Emitir com este favorito"><Play size={14} aria-hidden />Usar</button></form>
            <Link className="pc-icone-acao" href={`/contribuinte/favoritos/${fav.id}`} title="Editar" aria-label="Editar"><Pencil size={16} aria-hidden /></Link>
            <ExcluirRascunho id={fav.id} action={excluirFavoritoAction} pergunta="Excluir este serviço favorito?" titulo="Excluir favorito" />
          </> : null}</td>
        </tr>)}</tbody>
      </table></div> : <Vazio icone={Star} titulo="Nenhum serviço favorito ainda" texto="Salve um serviço com tomador e valor para emitir com um clique."
        acao={empresa.podeEmitir && !cheio ? <Link className="pc-botao" href="/contribuinte/favoritos/novo"><Plus size={16} aria-hidden />Novo Serviço Favorito</Link> : null} />}
      <p className="pc-paginacao"><span>{favoritos.length} de {FAVORITOS_MAX} favoritos</span></p>
    </Cartao>
  </>;
}
