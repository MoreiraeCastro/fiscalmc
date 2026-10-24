import Link from "next/link";
import { Aviso, Cartao } from "./portal-shell";
import { BotaoEmitir } from "./botao-emitir";
import { SalvarComoFavorito } from "./salvar-favorito";
import { CST_PIS_COFINS, MODO_PRESTACAO, MOEDAS, MOTIVOS_SUBSTITUICAO, previaValores, RETENCAO_PIS_COFINS, VINCULO_PARTES } from "@/lib/contribuinte/dps";
import { extrasDoRascunho } from "@/lib/contribuinte/extras-dps";
import paises from "@/lib/contribuinte/paises.json";
import indicadores from "@/lib/contribuinte/indicadores-operacao.json";
import { createAdminClient } from "@/lib/supabase/admin";
import { CST_IBS_CBS } from "@/lib/nfse/ibs-cbs";
import { relationOne } from "@/lib/presentation/relations";
import { ambienteEmissao, dadosEmitente, previaTributacao, tomadorPorId, type ServicoPronto } from "@/lib/contribuinte/emissao";
import { formatarData, formatarDocumento, formatarValor } from "@/lib/contribuinte/formato";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";
import type { Rascunho } from "@/lib/contribuinte/rascunhos";
import type { EmpresaContribuinte } from "@/lib/contribuinte/contexto";

const NOME_PAIS = new Map(paises.map((item) => [item.codigo, item.nome]));

export function aliquotaTexto(bp: number | undefined) {
  return bp === undefined ? "—" : `${(bp / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/**
 * Revisão antes de emitir (o passo 4 do Emissor Nacional): blocos com "Editar", prévia dos valores e o botão Emitir.
 * Usada no passo 4 da emissão completa e embaixo do formulário da emissão rápida.
 */
export async function RevisaoEmissao({ rascunho, empresa, escritorio, servicos, linkEditar, voltar }: { rascunho: Rascunho; empresa: EmpresaContribuinte; escritorio: boolean; servicos: ServicoPronto[]; linkEditar: (alvo: "pessoas" | "servico" | "valores") => string; voltar: string }) {
  const dados = rascunho.dados;
  const subst = dados.substituicao;
  const servico = servicos.find((item) => item.id === dados.servico?.modeloId);
  const [emitente, previa] = await Promise.all([dadosEmitente(empresa.id), previaTributacao(empresa.id, dados)]);
  const exigeAliquota = Boolean(escritorio && servico?.exigeAliquotaManual);
  const tomador = dados.tomador ? await tomadorPorId(empresa.id, dados.tomador.clienteId) : null;
  const valores = dados.valores!;
  const contas = previaValores({ valorCentavos: valores.valorCentavos, aliquotaBp: previa?.aliquotaBp, retido: previa?.retido ?? false, descIncondCentavos: valores.descIncondCentavos, descCondCentavos: valores.descCondCentavos, federal: valores.federal });
  const federal = valores.federal;
  const exterior = tomador?.person_type === "FOREIGN";
  const comercio = exterior ? dados.comercioExterior : undefined;
  const complemento = dados.complemento;
  const intermediario = dados.intermediario;
  const producao = ambienteEmissao() === "PRODUCAO";
  const original = subst ? await notaOriginal(empresa.id, subst.notaId) : null;
  const editar = (alvo: "pessoas" | "servico" | "valores") => <Link className="pc-link" href={linkEditar(alvo)}>Editar</Link>;
  const enderecoTomador = tomador ? [tomador.street, tomador.address_number, tomador.address_complement, tomador.neighborhood, exterior ? tomador.city : "", exterior ? tomador.state : ""].filter(Boolean).join(", ") : "";
  const tomadorTexto = !tomador ? "Não informado" : exterior ? `${tomador.foreign_tax_id ? `NIF ${tomador.foreign_tax_id}` : "Sem NIF"} - ${tomador.legal_name}` : `${formatarDocumento(tomador.tax_id)} - ${tomador.legal_name}`;
  return <>
    {subst ? <Aviso>Revise a DPS comparando com a NFS-e que será substituída. Os campos <span className="pc-mudou">destacados</span> mudaram. Ao emitir, a original fica cancelada por substituição.</Aviso>
      : <Aviso>Revise a sua DPS e confira o cálculo prévio do imposto. Estando tudo certo, clique em <strong>Emitir NFS-e</strong>.</Aviso>}
    {subst && original ? <Cartao titulo="Comparação">
      <div className="pc-tabela-rolagem"><table className="pc-tabela pc-comparacao">
        <thead><tr><th>Campo</th><th>NFS-e original</th><th>NFS-e substituta</th></tr></thead>
        <tbody>{[
          ["Competência", formatarData(original.competencia), formatarData(dados.competencia)],
          ["Tomador", original.tomador, tomador ? tomadorTexto : "—"],
          ["Serviço", original.servico, servico ? `${servico.codigo ?? ""} - ${servico.descricaoCodigo ?? servico.nome}` : "—"],
          ["Descrição", original.descricao, dados.servico?.descricao ?? ""],
          ["Valor do serviço", `R$ ${formatarValor(original.valorCentavos)}`, `R$ ${formatarValor(valores.valorCentavos)}`],
        ].map(([campo, antes, depois]) => <tr key={campo}><td>{campo}</td><td className="pre">{antes}</td><td className={`pre${antes !== depois ? " pc-mudou" : ""}`}>{depois}</td></tr>)}</tbody>
      </table></div>
      <dl className="pc-resumo"><div><dt>Motivo da substituição</dt><dd>{subst.motivoCodigo ? `${subst.motivoCodigo} - ${MOTIVOS_SUBSTITUICAO[subst.motivoCodigo]}` : "—"}{subst.motivo ? ` · ${subst.motivo}` : ""}</dd></div></dl>
    </Cartao> : null}
    <Cartao titulo="Pessoas" acoes={editar("pessoas")}>
      <dl className="pc-resumo">
        <div><dt>Data de competência</dt><dd>{formatarData(dados.competencia)}</dd></div>
        <div><dt>Emitente</dt><dd>{formatarDocumento(emitente.cnpj)} - {emitente.razaoSocial}</dd></div>
        <div><dt>Opção no Simples Nacional</dt><dd>{emitente.opcaoSimples}</dd></div>
        <div><dt>Tomador{exterior ? " (exterior)" : ""}</dt><dd>{tomadorTexto}</dd></div>
        {tomador?.municipality_code || enderecoTomador ? <div><dt>Endereço do tomador</dt><dd>{[enderecoTomador, tomador?.municipality_code ? nomeMunicipio(tomador.municipality_code) : "", tomador?.postal_code ? `CEP ${tomador.postal_code}` : "", exterior && tomador?.foreign_postal_code ? `Código postal ${tomador.foreign_postal_code}` : "", exterior ? NOME_PAIS.get(tomador?.country_code ?? "") ?? tomador?.country_code : ""].filter(Boolean).join(" · ")}</dd></div> : null}
        <div><dt>Intermediário</dt><dd>{intermediario ? `${formatarDocumento(intermediario.documento)} - ${intermediario.nome}` : "Não informado"}</dd></div>
      </dl>
    </Cartao>
    <Cartao titulo="Serviço" acoes={editar("servico")}>
      <dl className="pc-resumo">
        <div><dt>Código de Tributação Nacional</dt><dd>{servico ? `${servico.codigo ?? ""} - ${servico.descricaoCodigo ?? servico.nome}` : "Serviço indisponível"}</dd></div>
        <div><dt>Item da NBS</dt><dd>{servico?.nbs ?? "—"}</dd></div>
        <div><dt>Local da prestação</dt><dd>{nomeMunicipio(servico?.municipioPrestacao ?? empresa.municipio)}</dd></div>
        <div><dt>Descrição do serviço</dt><dd className="pre">{dados.servico?.descricao}</dd></div>
        {complemento?.docTecnico ? <div><dt>Documento de responsabilidade técnica</dt><dd>{complemento.docTecnico}</dd></div> : null}
        {complemento?.docReferencia ? <div><dt>Documento de referência</dt><dd>{complemento.docReferencia}</dd></div> : null}
        {complemento?.pedido ? <div><dt>Pedido/Ordem de Compra/OS/Projeto</dt><dd>{complemento.pedido}</dd></div> : null}
        {complemento?.informacoes ? <div><dt>Informações complementares</dt><dd className="pre">{complemento.informacoes}</dd></div> : null}
      </dl>
    </Cartao>
    {comercio ? <Cartao titulo="Comércio exterior" acoes={editar("servico")}>
      <dl className="pc-resumo">
        <div><dt>Modo de prestação</dt><dd>{comercio.modo} - {MODO_PRESTACAO[comercio.modo as keyof typeof MODO_PRESTACAO]}</dd></div>
        <div><dt>Vínculo entre as partes</dt><dd>{comercio.vinculo} - {VINCULO_PARTES[comercio.vinculo as keyof typeof VINCULO_PARTES]}</dd></div>
        <div><dt>Valor na moeda</dt><dd>{MOEDAS[comercio.moeda as keyof typeof MOEDAS] ?? comercio.moeda} {formatarValor(comercio.valorMoedaCentavos)}</dd></div>
        <div><dt>Compartilhar com o MDIC</dt><dd>{comercio.mdic === "1" ? "Sim" : "Não"}</dd></div>
      </dl>
    </Cartao> : exterior ? <Aviso tipo="erro">Tomador no exterior: informe os dados de comércio exterior no passo Serviço.</Aviso> : null}
    {dados.informarIbsCbs && dados.ibsCbs ? <Cartao titulo="IBS/CBS" acoes={editar("servico")}>
      <dl className="pc-resumo">
        <div><dt>Situação tributária</dt><dd>{dados.ibsCbs.cst} - {CST_IBS_CBS[dados.ibsCbs.cst] ?? ""}</dd></div>
        <div><dt>Classificação tributária</dt><dd>{dados.ibsCbs.classificacao}</dd></div>
        <div><dt>Indicador da operação</dt><dd>{dados.ibsCbs.indicadorOperacao} - {indicadores.find((i) => i.codigo === dados.ibsCbs!.indicadorOperacao)?.local ?? ""}</dd></div>
        <div><dt>Uso ou consumo pessoal</dt><dd>{dados.ibsCbs.consumoPessoal === "1" ? "Sim" : "Não"}</dd></div>
        <div><dt>Valores</dt><dd>Calculados pela Receita na emissão (aparecem no Visualizar).</dd></div>
      </dl>
    </Cartao> : null}
    <Cartao titulo="Valores" acoes={editar("valores")}>
      <dl className="pc-resumo">
        <div><dt>Valor do serviço</dt><dd>R$ {formatarValor(valores.valorCentavos)}</dd></div>
        {valores.descIncondCentavos ? <div><dt>Desconto incondicionado</dt><dd>R$ {formatarValor(valores.descIncondCentavos)}</dd></div> : null}
        {valores.descCondCentavos ? <div><dt>Desconto condicionado</dt><dd>R$ {formatarValor(valores.descCondCentavos)}</dd></div> : null}
        {federal && federal.cst !== "00" ? <div><dt>PIS/COFINS</dt><dd>{federal.cst} - {CST_PIS_COFINS[federal.cst as keyof typeof CST_PIS_COFINS]} · retenção: {federal.retencaoPisCofins ? RETENCAO_PIS_COFINS[federal.retencaoPisCofins as keyof typeof RETENCAO_PIS_COFINS] : "—"}</dd></div> : null}
        <div><dt>Tributação do ISSQN</dt><dd>{previa?.tributacao ?? "—"}</dd></div>
        <div><dt>Retenção do ISSQN</dt><dd>{previa?.retencao ?? "—"}</dd></div>
        {valores.aliquotaManualBp !== undefined ? <div><dt>Alíquota informada</dt><dd>{aliquotaTexto(valores.aliquotaManualBp)} · fonte: {valores.fonteAliquota}</dd></div> : null}
      </dl>
    </Cartao>
    {!subst && empresa.podeEmitir ? <div className="pc-nao-imprime"><SalvarComoFavorito rascunhoId={rascunho.id} nomeSugerido={(servico?.descricaoCodigo ?? servico?.nome ?? "Serviço").slice(0, 60)} /></div> : null}
    <Cartao titulo="Prévia dos valores da NFS-e">
      {previa?.aviso ? <Aviso tipo="alerta">{previa.aviso}</Aviso> : null}
      <div className="pc-previa">
        <section><h3>ISSQN</h3><dl>
          <div><dt>Valor do serviço</dt><dd>{formatarValor(contas.valor)}</dd></div>
          <div><dt>Base de cálculo</dt><dd>{formatarValor(contas.base)}</dd></div>
          <div><dt>Alíquota</dt><dd>{aliquotaTexto(previa?.aliquotaBp)}</dd></div>
          <div><dt>ISSQN</dt><dd>{contas.issqn === null ? "calculado na emissão" : formatarValor(contas.issqn)}</dd></div>
        </dl></section>
        <section><h3>Tributação federal</h3><dl>
          {contas.debitos ? <div><dt>PIS / COFINS (débito)</dt><dd>{formatarValor(contas.debitos.pis)} / {formatarValor(contas.debitos.cofins)}</dd></div> : null}
          <div><dt>IRRF retido</dt><dd>{formatarValor(federal?.irrfCentavos ?? 0)}</dd></div>
          <div><dt>Contribuições sociais retidas</dt><dd>{formatarValor(federal?.csCentavos ?? 0)}</dd></div>
          <div><dt>Contribuição previdenciária retida</dt><dd>{formatarValor(federal?.cpCentavos ?? 0)}</dd></div>
        </dl></section>
        <section className="liquido"><h3>Valor líquido</h3><dl>
          <div><dt>Valor do serviço</dt><dd>{formatarValor(contas.valor)}</dd></div>
          {contas.descontos ? <div><dt>Descontos</dt><dd>{formatarValor(contas.descontos)}</dd></div> : null}
          <div><dt>Total retido</dt><dd>{formatarValor(contas.retido)}</dd></div>
          <div className="total"><dt>Valor líquido</dt><dd>R$ {formatarValor(contas.liquido)}</dd></div>
        </dl></section>
      </div>
      {emitente.simples ? <p className="pc-nota">Empresa do Simples Nacional: o ISSQN mostrado é informativo; o recolhimento segue o regime de apuração do Simples.</p> : null}
    </Cartao>
    {!servico ? <Aviso tipo="erro">O serviço escolhido não está mais pronto para emissão. Volte ao passo Serviço.</Aviso>
      : empresa.podeEmitir && !empresa.emissaoBloqueada && (tomador || dados.semTomador) && (!exterior || comercio) ? <BotaoEmitir rascunhoId={rascunho.id} chave={rascunho.chave} producao={producao} voltar={voltar} rotulo={subst ? "Emitir NFS-e Substituta" : "Emitir NFS-e"}
        pedido={{
          ...(escritorio ? { organizationId: empresa.id } : {}),
          serviceTemplateId: servico.id, ...(tomador && !dados.semTomador ? { customerId: tomador.id } : {}), amount: (valores.valorCentavos / 100).toFixed(2), serviceDate: dados.competencia!, description: dados.servico!.descricao,
          ...(dados.informarIbsCbs && dados.ibsCbs ? { ibsCbs: { finalConsumer: dados.ibsCbs.consumoPessoal, operationIndicator: dados.ibsCbs.indicadorOperacao, destinationIndicator: "0" as const, cst: dados.ibsCbs.cst, classification: dados.ibsCbs.classificacao } } : {}),
          ...(subst?.motivoCodigo ? { substitution: { invoiceId: subst.notaId, reasonCode: subst.motivoCodigo, ...(subst.motivo ? { reason: subst.motivo } : {}) } } : {}),
          ...(exigeAliquota && valores.aliquotaManualBp !== undefined && valores.fonteAliquota ? { manualIssRateBasisPoints: valores.aliquotaManualBp, manualIssRateSourceNote: valores.fonteAliquota } : {}),
          ...extrasDoRascunho(dados, exterior),
        }} />
      : null}
  </>;
}

/** Dados da nota que está sendo substituída, para a comparação do passo 4. */
/** Dados da nota que está sendo substituída, para a comparação do passo 4. */
async function notaOriginal(empresaId: string, notaId: string) {
  const { data } = await createAdminClient().from("invoices").select("service_date,amount_cents,description,customers(tax_id,legal_name),service_templates(name,national_service_codes(display_code,description))")
    .eq("organization_id", empresaId).eq("id", notaId).maybeSingle();
  if (!data) return null;
  const tomador = relationOne(data.customers);
  const modelo = relationOne(data.service_templates);
  const codigo = relationOne(modelo?.national_service_codes);
  return {
    competencia: data.service_date, valorCentavos: data.amount_cents, descricao: data.description,
    tomador: tomador ? `${formatarDocumento(tomador.tax_id)} - ${tomador.legal_name}` : "—",
    servico: codigo ? `${codigo.display_code} - ${codigo.description}` : modelo?.name ?? "—",
  };
}
