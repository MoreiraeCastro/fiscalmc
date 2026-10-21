import { notFound, redirect } from "next/navigation";
import { Aviso, Trilha } from "@/components/contribuinte/portal-shell";
import { FormFavorito } from "@/components/contribuinte/form-favorito";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { centavosParaTexto } from "@/lib/contribuinte/dps";
import { servicosProntos, tomadoresSalvos } from "@/lib/contribuinte/emissao";
import { carregarFavorito, FAVORITOS_MAX, listarFavoritos } from "@/lib/contribuinte/favoritos";
import { IBS_CBS_PADRAO } from "@/lib/nfse/ibs-cbs";

export const metadata = { title: "Serviço Favorito" };

const PADRAO_IBS = { cst: IBS_CBS_PADRAO.cst, classificacao: IBS_CBS_PADRAO.classification, indicadorOperacao: IBS_CBS_PADRAO.operationIndicator, consumoPessoal: IBS_CBS_PADRAO.finalConsumer };

export default async function FavoritoPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { empresa }] = await Promise.all([params, exigirEmpresa()]);
  const novo = id === "novo";
  if (!empresa.podeEmitir) redirect("/contribuinte/favoritos");
  const [favorito, servicos, tomadores, todos] = await Promise.all([novo ? null : carregarFavorito(empresa.id, id), servicosProntos(empresa.id), tomadoresSalvos(empresa.id), listarFavoritos(empresa.id)]);
  if (!novo && !favorito) notFound();
  const lotado = novo && todos.length >= FAVORITOS_MAX;
  const dados = favorito?.dados;
  return <>
    <Trilha itens={[["Serviços Favoritos", "/contribuinte/favoritos"], novo ? "Novo" : favorito!.nome]} />
    <h1 className="pc-titulo">{novo ? "Novo Serviço Favorito" : "Editar Serviço Favorito"}</h1>
    {lotado ? <Aviso tipo="alerta">Esta empresa já tem {FAVORITOS_MAX} serviços favoritos, o máximo. Exclua um para incluir outro.</Aviso> : null}
    {!servicos.length ? <Aviso tipo="alerta">A empresa ainda não tem serviço pronto para emissão; o favorito precisa de um serviço.</Aviso> : null}
    {!lotado ? <FormFavorito favoritoId={novo ? null : id}
      servicos={servicos.map((item) => ({ id: item.id, rotulo: `${item.codigo ? `${item.codigo} - ` : ""}${item.descricaoCodigo ?? item.nome}`, descricaoPadrao: item.descricaoPadrao }))}
      tomadores={tomadores.map((item) => ({ id: item.id, documento: item.documento, nome: item.nome }))}
      inicial={{
        nome: favorito?.nome ?? "",
        servico: dados?.servico.modeloId ?? (servicos.length === 1 ? servicos[0].id : ""),
        descricao: dados?.servico.descricao ?? (servicos.length === 1 ? servicos[0].descricaoPadrao ?? "" : ""),
        tomador: dados?.semTomador ? "NAO_INFORMADO" : dados?.tomador?.clienteId ?? "",
        valor: dados?.valorCentavos ? centavosParaTexto(dados.valorCentavos) : "",
        informarIbsCbs: Boolean(dados?.informarIbsCbs),
        ibsCbs: dados?.ibsCbs ?? PADRAO_IBS,
      }} /> : null}
  </>;
}
