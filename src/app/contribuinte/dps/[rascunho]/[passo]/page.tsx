import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { BarraPassos } from "@/components/contribuinte/campos";
import { FormPessoas } from "@/components/contribuinte/form-pessoas";
import { FormServico } from "@/components/contribuinte/form-servico";
import { FormValores, type PreviaTela } from "@/components/contribuinte/form-valores";
import { BotaoEmitir } from "@/components/contribuinte/botao-emitir";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { centavosParaTexto, passoLiberado, passoPorSlug, previaValores, type DadosRascunho } from "@/lib/contribuinte/dps";
import { ambienteEmissao, dadosEmitente, previaTributacao, servicosProntos, tomadoresSalvos, tomadorPorId, type Previa } from "@/lib/contribuinte/emissao";
import { formatarData, formatarDocumento, formatarValor, hojeBrasilia } from "@/lib/contribuinte/formato";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";
import { carregarRascunho } from "@/lib/contribuinte/rascunhos";

export const metadata = { title: "Emissão completa" };

function aliquotaTexto(bp: number | undefined) {
  return bp === undefined ? "—" : `${(bp / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

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

  const cabecalho = <>
    <Trilha itens={["Emissão Completa", passo.rotulo]} />
    <h1 className="pc-titulo">Emissão completa</h1>
    <BarraPassos atual={passo.numero} liberado={liberado} rascunhoId={rascunhoId} />
    {!empresa.podeEmitir ? <Aviso tipo="alerta">Seu usuário consulta esta empresa, mas não tem permissão para emitir por ela.</Aviso> : null}
    {empresa.emissaoBloqueada ? <Aviso tipo="alerta">A emissão desta empresa está <strong>bloqueada</strong> até o escritório concluir o cadastro. Dá para preencher o rascunho, mas não emitir.</Aviso> : null}
  </>;

  if (passo.slug === "pessoas") {
    const [emitente, tomadores] = await Promise.all([dadosEmitente(empresa.id), tomadoresSalvos(empresa.id)]);
    return <>{cabecalho}<FormPessoas rascunhoId={rascunhoId} hoje={hojeBrasilia()} tomadores={tomadores}
      inicial={{ competencia: dados.competencia ?? hojeBrasilia(), tomador: dados.tomador ?? null }}
      emitente={{ ...emitente, municipio: nomeMunicipio(emitente.municipio) }} /></>;
  }

  const servicos = await servicosProntos(empresa.id);
  if (passo.slug === "servico") {
    return <>{cabecalho}<FormServico rascunhoId={rascunhoId!} escritorio={escritorio} empresaId={empresa.id}
      inicial={{ modeloId: dados.servico?.modeloId ?? "", descricao: dados.servico?.descricao ?? "" }}
      servicos={servicos.map((item) => ({ id: item.id, nome: item.nome, codigo: item.codigo, descricaoCodigo: item.descricaoCodigo, nbs: item.nbs, descricaoPadrao: item.descricaoPadrao, municipioPrestacao: nomeMunicipio(item.municipioPrestacao ?? empresa.municipio) }))} /></>;
  }

  const servico = servicos.find((item) => item.id === dados.servico?.modeloId);
  const [emitente, previa] = await Promise.all([dadosEmitente(empresa.id), previaTributacao(empresa.id, dados)]);
  const exigeAliquota = Boolean(escritorio && servico?.exigeAliquotaManual);

  if (passo.slug === "valores") {
    return <>{cabecalho}<FormValores rascunhoId={rascunhoId!} simples={emitente.simples} exigeAliquota={exigeAliquota} previa={previaParaTela(previa)}
      inicial={{ valor: dados.valores ? centavosParaTexto(dados.valores.valorCentavos) : "", aliquota: dados.valores?.aliquotaManualBp !== undefined ? (dados.valores.aliquotaManualBp / 100).toFixed(2).replace(".", ",") : "", fonte: dados.valores?.fonteAliquota ?? "" }} /></>;
  }

  // Passo 4: revisão em blocos com "Editar", prévia dos valores e Emitir.
  const tomador = dados.tomador ? await tomadorPorId(empresa.id, dados.tomador.clienteId) : null;
  const valores = dados.valores!;
  const contas = previaValores({ valorCentavos: valores.valorCentavos, aliquotaBp: previa?.aliquotaBp, retido: previa?.retido ?? false });
  const producao = ambienteEmissao() === "PRODUCAO";
  const editar = (alvo: string) => <Link className="pc-link" href={`/contribuinte/dps/${rascunhoId}/${alvo}`}>Editar</Link>;
  const enderecoTomador = tomador ? [tomador.street, tomador.address_number, tomador.address_complement, tomador.neighborhood].filter(Boolean).join(", ") : "";
  return <>
    {cabecalho}
    <Aviso>Revise a sua DPS e confira o cálculo prévio do imposto. Estando tudo certo, clique em <strong>Emitir NFS-e</strong>.</Aviso>
    <Cartao titulo="Pessoas" acoes={editar("pessoas")}>
      <dl className="pc-resumo">
        <div><dt>Data de competência</dt><dd>{formatarData(dados.competencia)}</dd></div>
        <div><dt>Emitente</dt><dd>{formatarDocumento(emitente.cnpj)} - {emitente.razaoSocial}</dd></div>
        <div><dt>Opção no Simples Nacional</dt><dd>{emitente.opcaoSimples}</dd></div>
        <div><dt>Tomador</dt><dd>{tomador ? `${formatarDocumento(tomador.tax_id)} - ${tomador.legal_name}` : "—"}</dd></div>
        {tomador?.municipality_code || enderecoTomador ? <div><dt>Endereço do tomador</dt><dd>{[enderecoTomador, tomador?.municipality_code ? nomeMunicipio(tomador.municipality_code) : "", tomador?.postal_code ? `CEP ${tomador.postal_code}` : ""].filter(Boolean).join(" · ")}</dd></div> : null}
        <div><dt>Intermediário</dt><dd>Não informado</dd></div>
      </dl>
    </Cartao>
    <Cartao titulo="Serviço" acoes={editar("servico")}>
      <dl className="pc-resumo">
        <div><dt>Código de Tributação Nacional</dt><dd>{servico ? `${servico.codigo ?? ""} - ${servico.descricaoCodigo ?? servico.nome}` : "Serviço indisponível"}</dd></div>
        <div><dt>Item da NBS</dt><dd>{servico?.nbs ?? "—"}</dd></div>
        <div><dt>Local da prestação</dt><dd>{nomeMunicipio(servico?.municipioPrestacao ?? empresa.municipio)}</dd></div>
        <div><dt>Descrição do serviço</dt><dd className="pre">{dados.servico?.descricao}</dd></div>
      </dl>
    </Cartao>
    <Cartao titulo="Valores" acoes={editar("valores")}>
      <dl className="pc-resumo">
        <div><dt>Valor do serviço</dt><dd>R$ {formatarValor(valores.valorCentavos)}</dd></div>
        <div><dt>Tributação do ISSQN</dt><dd>{previa?.tributacao ?? "—"}</dd></div>
        <div><dt>Retenção do ISSQN</dt><dd>{previa?.retencao ?? "—"}</dd></div>
        {valores.aliquotaManualBp !== undefined ? <div><dt>Alíquota informada</dt><dd>{aliquotaTexto(valores.aliquotaManualBp)} · fonte: {valores.fonteAliquota}</dd></div> : null}
      </dl>
    </Cartao>
    <Cartao titulo="Prévia dos valores da NFS-e">
      {previa?.aviso ? <Aviso tipo="alerta">{previa.aviso}</Aviso> : null}
      <div className="pc-previa">
        <section><h3>ISSQN</h3><dl>
          <div><dt>Valor do serviço</dt><dd>{formatarValor(contas.base)}</dd></div>
          <div><dt>Base de cálculo</dt><dd>{formatarValor(contas.base)}</dd></div>
          <div><dt>Alíquota</dt><dd>{aliquotaTexto(previa?.aliquotaBp)}</dd></div>
          <div><dt>ISSQN</dt><dd>{contas.issqn === null ? "calculado na emissão" : formatarValor(contas.issqn)}</dd></div>
        </dl></section>
        <section><h3>Tributação federal</h3><dl>
          <div><dt>PIS / COFINS retidos</dt><dd>0,00</dd></div>
          <div><dt>IRRF</dt><dd>0,00</dd></div>
          <div><dt>CS / CP retidas</dt><dd>0,00</dd></div>
        </dl></section>
        <section className="liquido"><h3>Valor líquido</h3><dl>
          <div><dt>Valor do serviço</dt><dd>{formatarValor(contas.base)}</dd></div>
          <div><dt>Total retido</dt><dd>{formatarValor(contas.retido)}</dd></div>
          <div className="total"><dt>Valor líquido</dt><dd>R$ {formatarValor(contas.liquido)}</dd></div>
        </dl></section>
      </div>
      {emitente.simples ? <p className="pc-nota">Empresa do Simples Nacional: o ISSQN mostrado é informativo; o recolhimento segue o regime de apuração do Simples.</p> : null}
    </Cartao>
    {!servico ? <Aviso tipo="erro">O serviço escolhido não está mais pronto para emissão. Volte ao passo Serviço.</Aviso>
      : empresa.podeEmitir && !empresa.emissaoBloqueada && tomador ? <BotaoEmitir rascunhoId={rascunhoId!} chave={rascunho!.chave} producao={producao} voltar={`/contribuinte/dps/${rascunhoId}/valores`}
        pedido={{
          ...(escritorio ? { organizationId: empresa.id } : {}),
          serviceTemplateId: servico.id, customerId: tomador.id, amount: (valores.valorCentavos / 100).toFixed(2), serviceDate: dados.competencia!, description: dados.servico!.descricao,
          ...(exigeAliquota && valores.aliquotaManualBp !== undefined && valores.fonteAliquota ? { manualIssRateBasisPoints: valores.aliquotaManualBp, manualIssRateSourceNote: valores.fonteAliquota } : {}),
        }} />
      : null}
  </>;
}
