import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { BarraPassos } from "@/components/contribuinte/campos";
import { FormPessoas } from "@/components/contribuinte/form-pessoas";
import { FormServico } from "@/components/contribuinte/form-servico";
import { FormValores, type PreviaTela } from "@/components/contribuinte/form-valores";
import { aliquotaTexto, RevisaoEmissao } from "@/components/contribuinte/revisao-emissao";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { regimeFederal, centavosParaTexto, passoLiberado, passoPorSlug, type DadosRascunho } from "@/lib/contribuinte/dps";
import { getConfiguredNFSeEnvironment } from "@/lib/nfse/environments";
import { IBS_CBS_OBRIGATORIO_DESDE, IBS_CBS_PADRAO } from "@/lib/nfse/ibs-cbs";
import { catalogoNacional, dadosEmitente, modoEmissao, previaTributacao, servicosProntos, tomadoresSalvos, type Previa } from "@/lib/contribuinte/emissao";
import { formatarData, formatarValor, hojeBrasilia } from "@/lib/contribuinte/formato";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";
import { carregarRascunho } from "@/lib/contribuinte/rascunhos";
import { listarFavoritos } from "@/lib/contribuinte/favoritos";
import { usarFavoritoAction } from "@/app/contribuinte/favoritos/actions";
import { Star } from "lucide-react";

export const metadata = { title: "Emissão completa" };

function previaParaTela(previa: Previa | null): PreviaTela {
  return previa ? { tributacao: previa.tributacao, retencao: previa.retencao, aliquota: aliquotaTexto(previa.aliquotaBp), origem: previa.origemAliquota, aviso: previa.aviso } : null;
}

export default async function PassoPage({ params }: { params: Promise<{ rascunho: string; passo: string }> }) {
  const [{ rascunho: rascunhoParam, passo: slug }, { empresa, escritorio }] = await Promise.all([params, exigirEmpresa()]);
  const passo = passoPorSlug(slug);
  if (!passo) notFound();
  const novo = rascunhoParam === "novo";
  if (novo && passo.numero !== 1) redirect("/contribuinte/dps/novo/pessoas");
  const rascunho = novo ? null : await carregarRascunho(empresa.id, rascunhoParam);
  if (!novo && !rascunho) notFound();
  if (rascunho?.notaId) redirect(`/contribuinte/nfse/${rascunho.notaId}`);
  const dados: DadosRascunho = rascunho?.dados ?? {};
  const liberado = passoLiberado(dados);
  if (rascunho && passo.numero > liberado) redirect(`/contribuinte/dps/${rascunho.id}/${["pessoas", "servico", "valores", "emitir"][liberado - 1]}`);
  const rascunhoId = rascunho?.id ?? null;

  const subst = dados.substituicao;
  const cabecalho = <>
    <Trilha itens={[subst ? "Substituição de NFS-e" : "Emissão Completa", subst && passo.numero === 4 ? "Substituição" : passo.rotulo]} />
    <h1 className="pc-titulo">{subst ? "Substituição de NFS-e" : "Emissão completa"}</h1>
    <BarraPassos atual={passo.numero} liberado={liberado} rascunhoId={rascunhoId} substituicao={Boolean(subst)} />
    {subst ? <Cartao titulo="Substituição de NFS-e" className="pc-subst">
      <dl className="pc-resumo">
        <div><dt>Chave de acesso da NFS-e substituída</dt><dd className="mono"><Link className="pc-link" href={`/contribuinte/nfse/${subst.notaId}`}>{subst.chave}</Link></dd></div>
        <div><dt>Data de competência</dt><dd>{formatarData(subst.competencia)}</dd></div>
        <div><dt>Valor do serviço</dt><dd>R$ {formatarValor(subst.valorCentavos)}</dd></div>
      </dl>
    </Cartao> : null}
    {!empresa.podeEmitir ? <Aviso tipo="alerta">Seu usuário consulta esta empresa, mas não tem permissão para emitir por ela.</Aviso> : null}
    {empresa.emissaoBloqueada ? <Aviso tipo="alerta">A emissão desta empresa está <strong>bloqueada</strong> até o escritório concluir o cadastro. Dá para preencher o rascunho, mas não emitir.</Aviso> : null}
  </>;

  if (passo.slug === "pessoas") {
    const [emitente, tomadores, favoritos] = await Promise.all([dadosEmitente(empresa.id), tomadoresSalvos(empresa.id), novo ? listarFavoritos(empresa.id) : Promise.resolve([])]);
    return <>{cabecalho}
      {favoritos.length && empresa.podeEmitir ? <Cartao titulo="Começar de um serviço favorito" acoes={<Link className="pc-link" href="/contribuinte/favoritos">Gerenciar favoritos</Link>}>
        <div className="pc-favoritos-rapidos">{favoritos.map((fav) => <form key={fav.id} action={usarFavoritoAction}>
          <input type="hidden" name="id" value={fav.id} />
          <button type="submit"><Star size={15} aria-hidden /><span><strong>{fav.nome}</strong><small>{fav.dados.semTomador ? "Sem tomador" : fav.dados.tomador?.nome ?? "Tomador na emissão"}{fav.dados.valorCentavos ? ` · R$ ${formatarValor(fav.dados.valorCentavos)}` : ""}</small></span></button>
        </form>)}</div>
      </Cartao> : null}
      <FormPessoas rascunhoId={rascunhoId} hoje={hojeBrasilia()} tomadores={tomadores}
      inicial={{ competencia: dados.competencia ?? hojeBrasilia(), tomador: dados.tomador ?? null, semTomador: Boolean(dados.semTomador), informarIbsCbs: Boolean(dados.informarIbsCbs), intermediario: dados.intermediario ?? null }}
      ibsCbsObrigatorioDesde={IBS_CBS_OBRIGATORIO_DESDE[getConfiguredNFSeEnvironment()]}
      emitente={{ ...emitente, municipio: nomeMunicipio(emitente.municipio) }} /></>;
  }

  const servicos = await servicosProntos(empresa.id);
  if (passo.slug === "servico") {
    const modo = await modoEmissao(empresa.id);
    const nacional = modo.exigeRevisao ? null : {
      catalogo: await catalogoNacional(), competencia: dados.competencia ?? hojeBrasilia(), municipio: nomeMunicipio(empresa.municipio),
      usados: servicos.map((item) => ({ id: item.id, codigoNacionalId: item.codigoNacionalId, codigoMunicipal: item.codigoMunicipal, nbs: item.nbs, automatico: item.automatico })),
    };
    const avisoPerfil = modo.perfilAceito ? null : <Aviso tipo="alerta">{modo.exigeRevisao
      ? <>Esta empresa só emite com a configuração fiscal revisada pelo escritório, e ela ainda não foi revisada.</>
      : <>A consulta de CNPJ não informou se esta empresa é do Simples Nacional. {escritorio ? <>Escolha o regime em <Link className="pc-link" href={`/admin/empresas/${empresa.id}?tab=fiscal`}>Configuração fiscal</Link> antes de emitir.</> : "Peça ao escritório para informar o regime antes de emitir."}</>}</Aviso>;
    return <>{cabecalho}{avisoPerfil}<FormServico rascunhoId={rascunhoId!} escritorio={escritorio} empresaId={empresa.id} nacional={nacional}
      ibsCbs={dados.informarIbsCbs ? dados.ibsCbs ?? { cst: IBS_CBS_PADRAO.cst, classificacao: IBS_CBS_PADRAO.classification, indicadorOperacao: IBS_CBS_PADRAO.operationIndicator, consumoPessoal: IBS_CBS_PADRAO.finalConsumer } : null}
      inicial={{ modeloId: dados.servico?.modeloId ?? "", descricao: dados.servico?.descricao ?? "" }}
      complemento={dados.complemento ?? null} comercioExterior={dados.tomador?.exterior ? dados.comercioExterior ?? {} : null}
      servicos={servicos.map((item) => ({ id: item.id, nome: item.nome, codigo: item.codigo, descricaoCodigo: item.descricaoCodigo, nbs: item.nbs, descricaoPadrao: item.descricaoPadrao, municipioPrestacao: nomeMunicipio(item.municipioPrestacao ?? empresa.municipio) }))} /></>;
  }

  if (passo.slug === "valores") {
    const servico = servicos.find((item) => item.id === dados.servico?.modeloId);
    const [emitente, previa] = await Promise.all([dadosEmitente(empresa.id), previaTributacao(empresa.id, dados)]);
    const exigeAliquota = Boolean(escritorio && servico?.exigeAliquotaManual);
    return <>{cabecalho}<FormValores rascunhoId={rascunhoId!} simples={emitente.simples} regime={regimeFederal(emitente.simples, emitente.regimeTributario)} exigeAliquota={exigeAliquota} previa={previaParaTela(previa)}
      substituicao={subst ? { motivoCodigo: subst.motivoCodigo ?? "", motivo: subst.motivo ?? "" } : undefined}
      inicial={{ valor: dados.valores ? centavosParaTexto(dados.valores.valorCentavos) : "", aliquota: dados.valores?.aliquotaManualBp !== undefined ? (dados.valores.aliquotaManualBp / 100).toFixed(2).replace(".", ",") : "", fonte: dados.valores?.fonteAliquota ?? "", descIncond: dados.valores?.descIncondCentavos ? centavosParaTexto(dados.valores.descIncondCentavos) : "", descCond: dados.valores?.descCondCentavos ? centavosParaTexto(dados.valores.descCondCentavos) : "", federal: dados.valores?.federal ?? null }} /></>;
  }

  // Passo 4: revisão em blocos com "Editar", prévia dos valores e Emitir.
  return <>{cabecalho}<RevisaoEmissao rascunho={rascunho!} empresa={empresa} escritorio={escritorio} servicos={servicos}
    linkEditar={(alvo) => `/contribuinte/dps/${rascunhoId}/${alvo}`} voltar={`/contribuinte/dps/${rascunhoId}/valores`} /></>;
}
