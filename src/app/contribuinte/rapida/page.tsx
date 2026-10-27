import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso, Trilha } from "@/components/contribuinte/portal-shell";
import { FormRapida, type InicialRapida } from "@/components/contribuinte/form-rapida";
import { RevisaoEmissao } from "@/components/contribuinte/revisao-emissao";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { centavosParaTexto, passoLiberado, regimeFederal } from "@/lib/contribuinte/dps";
import { catalogoNacional, dadosEmitente, modoEmissao, servicosProntos, tomadoresSalvos, ultimoServicoUsado } from "@/lib/contribuinte/emissao";
import { hojeBrasilia } from "@/lib/contribuinte/formato";
import { carregarRascunho } from "@/lib/contribuinte/rascunhos";
import { getConfiguredNFSeEnvironment } from "@/lib/nfse/environments";
import { IBS_CBS_OBRIGATORIO_DESDE, IBS_CBS_PADRAO } from "@/lib/nfse/ibs-cbs";

export const metadata = { title: "Emissão rápida" };

/**
 * Emissão rápida: tomador, serviço e valor numa tela só ("Revisar e emitir"). A mesma página mostra em seguida a revisão
 * (a do passo 4) com o botão Emitir; "Editar" volta para o formulário. Exterior e substituição seguem na emissão completa.
 */
export default async function EmissaoRapidaPage({ searchParams }: { searchParams: Promise<{ r?: string; editar?: string }> }) {
  const [{ empresa, escritorio }, filtros] = await Promise.all([exigirEmpresa(), searchParams]);
  const rascunho = filtros.r ? await carregarRascunho(empresa.id, filtros.r) : null;
  if (filtros.r && !rascunho) redirect("/contribuinte/rapida");
  if (rascunho?.notaId) redirect(`/contribuinte/nfse/${rascunho.notaId}`);
  if (rascunho && !rascunho.dados.rapida) redirect(`/contribuinte/dps/${rascunho.id}/pessoas`);

  const [modo, servicos] = await Promise.all([modoEmissao(empresa.id), servicosProntos(empresa.id)]);
  const cabecalho = <>
    <Trilha itens={["Emissão rápida"]} />
    <div className="pc-titulo-linha">
      <h1 className="pc-titulo">Emissão rápida</h1>
      <div className="pc-acoes"><Link className="pc-link" href="/contribuinte/dps/novo/pessoas">Emissão completa (4 passos)</Link></div>
    </div>
    {!empresa.podeEmitir ? <Aviso tipo="alerta">Seu usuário consulta esta empresa, mas não tem permissão para emitir por ela.</Aviso> : null}
    {empresa.emissaoBloqueada ? <Aviso tipo="alerta">A emissão desta empresa está <strong>bloqueada</strong> até o escritório concluir o cadastro.</Aviso> : null}
    {!modo.perfilAceito ? <Aviso tipo="alerta">{modo.exigeRevisao ? "Esta empresa só emite com a configuração fiscal revisada pelo escritório, e ela ainda não foi revisada."
      : "A consulta de CNPJ não informou se esta empresa é do Simples Nacional. O escritório precisa informar o regime antes de emitir."}</Aviso> : null}
  </>;

  // Revisão: o rascunho já passou pelas regras dos três passos; Emitir fica aqui mesmo.
  if (rascunho && filtros.editar !== "1" && passoLiberado(rascunho.dados) === 4) {
    const editar = `/contribuinte/rapida?r=${rascunho.id}&editar=1`;
    return <>{cabecalho}<RevisaoEmissao rascunho={rascunho} empresa={empresa} escritorio={escritorio} servicos={servicos} linkEditar={() => editar} voltar={editar} /></>;
  }

  const hoje = hojeBrasilia();
  const [tomadores, catalogo, ultimo, emitente] = await Promise.all([
    tomadoresSalvos(empresa.id),
    modo.exigeRevisao ? Promise.resolve([]) : catalogoNacional(),
    rascunho ? Promise.resolve(null) : ultimoServicoUsado(empresa.id),
    dadosEmitente(empresa.id),
  ]);
  const dados = rascunho?.dados ?? {};
  // Sem rascunho: o serviço e a descrição da última nota da empresa (a maioria emite sempre o mesmo).
  const modeloId = dados.servico?.modeloId ?? (ultimo && servicos.some((item) => item.id === ultimo.modeloId) ? ultimo.modeloId : servicos.length === 1 ? servicos[0].id : "");
  const padrao = servicos.find((item) => item.id === modeloId);
  const inicial: InicialRapida = {
    competencia: dados.competencia ?? hoje,
    tomador: dados.tomador && !dados.tomador.exterior ? dados.tomador : null,
    semTomador: Boolean(dados.semTomador),
    modeloId,
    descricao: dados.servico?.descricao ?? ultimo?.descricao ?? padrao?.descricaoPadrao ?? "",
    valor: dados.valores ? centavosParaTexto(dados.valores.valorCentavos) : "",
    descIncond: dados.valores?.descIncondCentavos ? centavosParaTexto(dados.valores.descIncondCentavos) : "",
    descCond: dados.valores?.descCondCentavos ? centavosParaTexto(dados.valores.descCondCentavos) : "",
    informarIbsCbs: Boolean(dados.informarIbsCbs),
    ibsCbs: dados.ibsCbs ?? { cst: IBS_CBS_PADRAO.cst, classificacao: IBS_CBS_PADRAO.classification, indicadorOperacao: IBS_CBS_PADRAO.operationIndicator, consumoPessoal: IBS_CBS_PADRAO.finalConsumer },
    intermediario: dados.intermediario ?? null,
    complemento: dados.complemento ?? null,
    federal: dados.valores?.federal ?? null,
  };
  return <>{cabecalho}
    {!servicos.length && modo.exigeRevisao ? <Aviso tipo="alerta">Esta empresa ainda não tem serviço liberado pelo escritório.</Aviso> : null}
    <FormRapida rascunhoId={rascunho?.id ?? null} hoje={hoje} regime={regimeFederal(emitente.simples, emitente.regimeTributario)} ibsCbsObrigatorioDesde={IBS_CBS_OBRIGATORIO_DESDE[getConfiguredNFSeEnvironment()]} tomadores={tomadores} inicial={inicial}
      servicos={servicos.map((item) => ({ id: item.id, nome: item.nome, codigo: item.codigo, descricaoCodigo: item.descricaoCodigo, descricaoPadrao: item.descricaoPadrao }))}
      nacional={modo.exigeRevisao ? null : { catalogo, usados: servicos.map((item) => ({ id: item.id, codigoNacionalId: item.codigoNacionalId, codigoMunicipal: item.codigoMunicipal, nbs: item.nbs, automatico: item.automatico })) }} />
  </>;
}
