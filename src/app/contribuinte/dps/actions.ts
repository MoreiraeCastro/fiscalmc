"use server";

import { redirect } from "next/navigation";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { hojeBrasilia } from "@/lib/contribuinte/formato";
import { getConfiguredNFSeEnvironment } from "@/lib/nfse/environments";
import { ibsCbsObrigatorio } from "@/lib/nfse/ibs-cbs";
import indicadores from "@/lib/contribuinte/indicadores-operacao.json";
import paises from "@/lib/contribuinte/paises.json";
import { centavosParaTexto, validarComercioExterior, validarComplemento, validarIbsCbs, validarIntermediario, validarMotivoSubstituicao, validarNovoTomador, validarPessoas, validarServico, validarTomadorExterior, validarValores, type ComercioExteriorRascunho, type ComplementoRascunho, type DadosRascunho, type Erros, type IbsCbsRascunho, type IntermediarioRascunho, type ServicoRascunho, type SubstituicaoRascunho, type TomadorRascunho, type ValoresRascunho } from "@/lib/contribuinte/dps";
import { modoEmissao, servicosProntos, tomadorPorId, tomadoresSalvos, type TomadorSalvo } from "@/lib/contribuinte/emissao";
import { discoverMunicipalServiceCodes, type MunicipalServiceOption } from "@/lib/nfse/municipal-parameters/discovery";
import { allNbsCatalog, nbsForLc116, searchNbsCatalog, type NbsCandidate } from "@/lib/organizations/nbs-activity-resolver";
import { ensureAutomaticService } from "@/lib/services/automatic-service";
import { SafeFiscalError } from "@/lib/nfse/errors";
import { carregarRascunho, excluirRascunho, gravarRascunho, registrarResultado } from "@/lib/contribuinte/rascunhos";
import { lookupCnpj, type CnpjLookupCustomer } from "@/lib/nfse/cnpj-lookup";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTaxId } from "@/lib/validation/identification";

export type EstadoPasso = { erros: Erros; mensagem?: string };

const SEM_PERMISSAO: EstadoPasso = { erros: {}, mensagem: "Seu usuário não tem permissão para emitir por esta empresa." };

async function empresaQueEmite() {
  const contexto = await exigirEmpresa();
  return contexto.empresa.podeEmitir ? contexto : null;
}

export type ConsultaTomador = { salvo?: TomadorSalvo; receita?: CnpjLookupCustomer; erro?: string };

/** Lupa ao lado do CPF/CNPJ: primeiro os tomadores já salvos da empresa; se for CNPJ novo, a base pública da Receita. */
export async function consultarTomador(documento: string): Promise<ConsultaTomador> {
  const { empresa } = await exigirEmpresa();
  const doc = normalizeTaxId(documento);
  if (doc.length !== 11 && doc.length !== 14) return { erro: "Informe um CPF (11 dígitos) ou CNPJ (14)." };
  const salvo = (await tomadoresSalvos(empresa.id)).find((item) => item.documento === doc);
  if (salvo) return { salvo };
  if (doc.length === 11) return {};
  const consulta = await lookupCnpj(doc);
  return consulta.ok ? { receita: consulta.customer } : { erro: consulta.error };
}

export type OpcoesDoCodigo = { opcoes?: MunicipalServiceOption[]; nbs?: NbsCandidate[]; existente?: { id: string; codigoMunicipal: string | null; nbs: string | null }; erro?: string };

async function codigoDoCatalogo(id: string) {
  const { data } = await createAdminClient().from("national_service_codes").select("id,code,item,subitem").eq("id", id).eq("active", true).maybeSingle();
  return data;
}

/**
 * Passo 2, ao escolher o "Código de Tributação Nacional": os códigos complementares do município (parâmetros do ADN, com a alíquota)
 * e as NBS que correspondem ao código. Se o escritório já configurou um serviço para esse código, vale o dele.
 */
export async function opcoesDoCodigo(codigoNacionalId: string, competencia: string, outraNbs = false): Promise<OpcoesDoCodigo> {
  const contexto = await empresaQueEmite();
  if (!contexto) return { erro: SEM_PERMISSAO.mensagem };
  if ((await modoEmissao(contexto.empresa.id)).exigeRevisao) return { erro: "Esta empresa só emite com serviços revisados pelo escritório." };
  const catalogo = await codigoDoCatalogo(codigoNacionalId);
  if (!catalogo) return { erro: "Código de tributação nacional não encontrado." };
  const existente = (await servicosProntos(contexto.empresa.id)).find((item) => !item.automatico && item.codigoNacionalId === catalogo.id);
  // `outraNbs`: quem emite quer outra NBS nesta nota; segue pelo caminho automático em vez do serviço do escritório.
  if (existente && !outraNbs) return { existente: { id: existente.id, codigoMunicipal: existente.codigoMunicipal, nbs: existente.nbs } };
  try {
    const opcoes = await discoverMunicipalServiceCodes({ organizationId: contexto.empresa.id, municipalityCode: contexto.empresa.municipio, nationalTaxCode: catalogo.code, competence: /^\d{4}-\d{2}-\d{2}$/.test(competencia) ? competencia : hojeBrasilia() });
    return { opcoes, nbs: nbsForLc116(catalogo.item, catalogo.subitem) };
  } catch (error) {
    return { erro: error instanceof SafeFiscalError ? error.safeMessage : "Não foi possível consultar os parâmetros do município agora." };
  }
}

/** A tabela NBS inteira, para o seletor do passo Serviço (carrega uma vez quando o campo aparece). */
export async function todasNbs(): Promise<NbsCandidate[]> {
  await exigirEmpresa();
  return allNbsCatalog();
}

/** Busca livre na tabela NBS (o Emissor Nacional deixa escolher qualquer item, não só os correlacionados). */
export async function buscarNbs(termo: string): Promise<NbsCandidate[]> {
  await exigirEmpresa();
  return searchNbsCatalog(termo, 40);
}

function texto(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? "");
}

type Contexto = NonNullable<Awaited<ReturnType<typeof empresaQueEmite>>>;
/** Resultado de um passo resolvido: os dados para o rascunho, ou o estado de erro para a tela. */
type Resolvido<T> = { ok: true; dados: T } | { ok: false; estado: EstadoPasso };

/** Passo 1 → Pessoas. Cria o tomador se for novo (com o endereço da Receita) e grava o rascunho. */
export async function salvarPessoas(rascunhoId: string | null, _anterior: EstadoPasso, formData: FormData): Promise<EstadoPasso> {
  const contexto = await empresaQueEmite();
  if (!contexto) return SEM_PERMISSAO;
  const pessoas = await resolverPessoas(contexto, formData);
  if (!pessoas.ok) return pessoas.estado;
  const id = await gravarRascunho({ empresaId: contexto.empresa.id, usuarioId: contexto.usuarioId, id: rascunhoId, passo: 2, dados: { ...pessoas.dados, ...(pessoas.dados.informarIbsCbs ? {} : { ibsCbs: undefined }) } });
  redirect(`/contribuinte/dps/${id}/servico`);
}

async function resolverPessoas(contexto: Contexto, formData: FormData): Promise<Resolvido<{ competencia: string; tomador?: TomadorRascunho; semTomador: boolean; intermediario?: IntermediarioRascunho; informarIbsCbs: boolean }>> {
  const { empresa, usuarioId } = contexto;
  const onde = texto(formData, "onde");
  const semTomador = onde === "NAO_INFORMADO";
  const exterior = onde === "EXTERIOR";
  let clienteId = semTomador ? "" : texto(formData, "clienteId");
  const documento = texto(formData, "documento");
  const erros: Erros = {};
  let tomador: TomadorRascunho | null = null;

  if (clienteId) {
    const salvo = await tomadorPorId(empresa.id, clienteId);
    if (salvo && (salvo.person_type === "FOREIGN") === exterior) tomador = { clienteId: salvo.id, documento: exterior ? salvo.foreign_tax_id : salvo.tax_id, nome: salvo.legal_name, ...(exterior ? { exterior: true } : {}) };
    else clienteId = "";
  }
  if (exterior && !tomador) {
    const resultado = await salvarTomadorExterior(contexto, formData);
    if ("erros" in resultado) Object.assign(erros, resultado.erros);
    else if ("falha" in resultado) return { ok: false, estado: { erros, mensagem: resultado.falha } };
    else tomador = resultado.tomador;
  }
  if (!semTomador && !exterior && !tomador && documento.trim()) {
    // CNPJ: a razão social é sempre a do cartão CNPJ (Receita), nunca a digitada.
    const doc = normalizeTaxId(documento);
    const cartao = doc.length === 14 ? await lookupCnpj(doc) : null;
    const nomeOficial = cartao?.ok && cartao.customer.legalName ? cartao.customer.legalName : null;
    const novo = validarNovoTomador({ documento, nome: nomeOficial ?? texto(formData, "nome"), email: texto(formData, "email") });
    if (!novo.ok) Object.assign(erros, novo.erros);
    else {
      const db = createAdminClient();
      const { data: existente } = await db.from("customers").select("id,tax_id,legal_name").eq("organization_id", empresa.id).eq("tax_id", novo.valor.documento).maybeSingle();
      if (existente) tomador = { clienteId: existente.id, documento: existente.tax_id, nome: existente.legal_name };
      else {
        let endereco: Partial<CnpjLookupCustomer> = {};
        try { endereco = JSON.parse(texto(formData, "endereco") || "{}") as Partial<CnpjLookupCustomer>; } catch { endereco = {}; }
        const limpo = (valor: unknown, max: number) => (typeof valor === "string" && valor.trim() ? valor.trim().slice(0, max) : null);
        const municipio = limpo(endereco.municipalityCode, 7);
        const { data: criado, error } = await db.from("customers").insert({
          organization_id: empresa.id, person_type: novo.valor.tipo, tax_id: novo.valor.documento, legal_name: novo.valor.nome,
          email: novo.valor.email, phone: limpo(texto(formData, "telefone"), 30), address: {},
          postal_code: limpo(endereco.postalCode, 8), street: limpo(endereco.street, 200), address_number: limpo(endereco.addressNumber, 20),
          address_complement: limpo(endereco.addressComplement, 120), neighborhood: limpo(endereco.neighborhood, 120),
          municipality_code: municipio && /^\d{7}$/.test(municipio) ? municipio : null, state: limpo(endereco.state, 2),
        }).select("id,tax_id,legal_name").single();
        if (error || !criado) return { ok: false, estado: { erros, mensagem: "Não foi possível salvar o tomador." } };
        await db.from("audit_logs").insert({ organization_id: empresa.id, actor_user_id: usuarioId, actor_type: contexto.escritorio ? "OFFICE" : "CLIENT", action: "customer_created", entity: "customer", entity_id: criado.id, safe_metadata: { via: "portal_contribuinte" } });
        tomador = { clienteId: criado.id, documento: criado.tax_id, nome: criado.legal_name };
      }
    }
  }
  // No exterior os erros do tomador já vêm campo a campo (não o "pesquise o CPF/CNPJ").
  const pessoas = validarPessoas({ competencia: texto(formData, "competencia"), clienteId: tomador?.clienteId ?? "", hoje: hojeBrasilia(), semTomador: semTomador || exterior });
  if (!pessoas.ok) Object.assign(erros, pessoas.erros);
  // Intermediário no Brasil: CNPJ fica com a razão social do cartão CNPJ, como no tomador.
  let intermediario: IntermediarioRascunho | undefined;
  if (texto(formData, "intermOnde") === "BRASIL") {
    const doc = normalizeTaxId(texto(formData, "intermDocumento"));
    const cartao = doc.length === 14 ? await lookupCnpj(doc) : null;
    const validado = validarIntermediario({ documento: doc, nome: cartao?.ok && cartao.customer.legalName ? cartao.customer.legalName : texto(formData, "intermNome"), email: texto(formData, "intermEmail") });
    if (validado.ok) intermediario = validado.valor; else Object.assign(erros, validado.erros);
  }
  if (Object.keys(erros).length || !pessoas.ok || (!tomador && !semTomador)) return { ok: false, estado: { erros } };
  // IBS/CBS: escolha do usuário, mas obrigatório a partir da competência exigida pelo ambiente.
  const informarIbsCbs = texto(formData, "ibsCbs") === "SIM" || ibsCbsObrigatorio(getConfiguredNFSeEnvironment(), pessoas.valor.competencia);
  return { ok: true, dados: { competencia: pessoas.valor.competencia, tomador: tomador ?? undefined, semTomador, intermediario, informarIbsCbs } };
}

/** Tomador no exterior digitado no passo 1: valida e salva (com NIF já cadastrado, atualiza o endereço). */
async function salvarTomadorExterior(contexto: NonNullable<Awaited<ReturnType<typeof empresaQueEmite>>>, formData: FormData): Promise<{ erros: Erros } | { falha: string } | { tomador: TomadorRascunho }> {
  const campo = (nome: string) => texto(formData, `ext_${nome}`);
  const validado = validarTomadorExterior({
    nifInformado: campo("nifInformado"), nif: campo("nif"), motivo: campo("motivo"), nome: campo("nome"), email: campo("email"), pais: campo("pais"),
    logradouro: campo("logradouro"), numero: campo("numero"), complemento: campo("complemento"), bairro: campo("bairro"), cidade: campo("cidade"), cep: campo("cep"), estado: campo("estado"),
  }, paises.map((item) => item.codigo));
  if (!validado.ok) return { erros: validado.erros };
  const v = validado.valor;
  const db = createAdminClient();
  const registro = {
    person_type: "FOREIGN", tax_id: null, legal_name: v.nome, email: v.email, foreign_tax_id: v.nif, no_foreign_tax_id_reason: v.motivo, country_code: v.pais,
    street: v.logradouro, address_number: v.numero, address_complement: v.complemento, neighborhood: v.bairro, city: v.cidade, foreign_postal_code: v.cep, state: v.estado,
    postal_code: null, municipality_code: null, updated_at: new Date().toISOString(),
  };
  const { empresa, usuarioId } = contexto;
  const existente = v.nif ? (await db.from("customers").select("id").eq("organization_id", empresa.id).eq("foreign_tax_id", v.nif).maybeSingle()).data : null;
  const gravado = existente
    ? await db.from("customers").update(registro).eq("organization_id", empresa.id).eq("id", existente.id).select("id").single()
    : await db.from("customers").insert({ ...registro, organization_id: empresa.id, address: {} }).select("id").single();
  if (gravado.error || !gravado.data) return { falha: "Não foi possível salvar o tomador." };
  await db.from("audit_logs").insert({ organization_id: empresa.id, actor_user_id: usuarioId, actor_type: contexto.escritorio ? "OFFICE" : "CLIENT", action: existente ? "customer_updated" : "customer_created", entity: "customer", entity_id: gravado.data.id, safe_metadata: { via: "portal_contribuinte", exterior: true } });
  return { tomador: { clienteId: gravado.data.id, documento: v.nif, nome: v.nome, exterior: true } };
}

export async function salvarServico(rascunhoId: string, _anterior: EstadoPasso, formData: FormData): Promise<EstadoPasso> {
  const contexto = await empresaQueEmite();
  if (!contexto) return SEM_PERMISSAO;
  const rascunho = await carregarRascunho(contexto.empresa.id, rascunhoId);
  const servico = await resolverServico(contexto, formData, { competencia: rascunho?.dados.competencia, informarIbsCbs: Boolean(rascunho?.dados.informarIbsCbs), exterior: Boolean(rascunho?.dados.tomador?.exterior) });
  if (!servico.ok) return servico.estado;
  // Trocar de serviço pode mudar a alíquota: os valores precisam ser confirmados de novo.
  const substituicao = rascunho?.dados.substituicao;
  const valores = rascunho?.dados.servico?.modeloId === servico.dados.servico.modeloId ? rascunho.dados.valores : substituicao ? { valorCentavos: substituicao.valorCentavos } : undefined;
  await gravarRascunho({ empresaId: contexto.empresa.id, usuarioId: contexto.usuarioId, id: rascunhoId, passo: 3, dados: { ...servico.dados, valores } });
  redirect(`/contribuinte/dps/${rascunhoId}/valores`);
}

/** campoIbs: nome dos campos de IBS/CBS no formulário (na emissão rápida levam prefixo, porque "cst" também é o do PIS/COFINS). */
async function resolverServico(contexto: Contexto, formData: FormData, base: { competencia?: string; informarIbsCbs: boolean; exterior: boolean; campoIbs?: (nome: string) => string }): Promise<Resolvido<{ servico: ServicoRascunho; complemento?: ComplementoRascunho; comercioExterior?: ComercioExteriorRascunho; ibsCbs?: IbsCbsRascunho }>> {
  const campoIbs = base.campoIbs ?? ((nome: string) => nome);
  // Lista nacional: o serviço da empresa é montado (ou reaproveitado) a partir do código, do complemento municipal e da NBS escolhidos.
  let modeloId = texto(formData, "servico");
  const codigoNacionalId = texto(formData, "codigoNacional");
  if (!modeloId && codigoNacionalId) {
    const montado = await montarServicoAutomatico(contexto, base.competencia ?? hojeBrasilia(), codigoNacionalId, texto(formData, "codigoMunicipal"), texto(formData, "nbs"));
    if ("erros" in montado) return { ok: false, estado: montado };
    modeloId = montado.id;
  }
  const servico = validarServico({ modeloId, descricao: texto(formData, "descricao") });
  if (!servico.ok) return { ok: false, estado: { erros: servico.erros } };
  const servicos = await servicosProntos(contexto.empresa.id);
  if (!servicos.some((item) => item.id === servico.valor.modeloId)) return { ok: false, estado: { erros: { servico: "Serviço indisponível para emissão" } } };
  const ibsCbs = base.informarIbsCbs
    ? validarIbsCbs({ cst: texto(formData, campoIbs("cst")), classificacao: texto(formData, campoIbs("classificacao")), indicadorOperacao: texto(formData, campoIbs("indicadorOperacao")), consumoPessoal: texto(formData, campoIbs("consumoPessoal")) }, indicadores.map((item) => item.codigo))
    : null;
  const complemento = validarComplemento({ docTecnico: texto(formData, "docTecnico"), docReferencia: texto(formData, "docReferencia"), pedido: texto(formData, "pedido"), informacoes: texto(formData, "informacoes") });
  const comercio = base.exterior
    ? validarComercioExterior({ modo: texto(formData, "cx_modo"), vinculo: texto(formData, "cx_vinculo"), moeda: texto(formData, "cx_moeda"), valorMoeda: texto(formData, "cx_valorMoeda"), mecPrestador: texto(formData, "cx_mecPrestador"), mecTomador: texto(formData, "cx_mecTomador"), movTempBens: texto(formData, "cx_movTempBens"), nDI: texto(formData, "cx_nDI"), nRE: texto(formData, "cx_nRE"), mdic: texto(formData, "cx_mdic") })
    : null;
  const errosExtras = { ...(ibsCbs && !ibsCbs.ok ? Object.fromEntries(Object.entries(ibsCbs.erros).map(([campo, erro]) => [campoIbs(campo), erro])) : {}), ...(!complemento.ok ? complemento.erros : {}), ...(comercio && !comercio.ok ? Object.fromEntries(Object.entries(comercio.erros).map(([campo, erro]) => [`cx_${campo}`, erro])) : {}) };
  if (Object.keys(errosExtras).length) return { ok: false, estado: { erros: errosExtras } };
  return { ok: true, dados: { servico: servico.valor, complemento: complemento.ok ? complemento.valor : undefined, comercioExterior: comercio?.ok ? comercio.valor : undefined, ...(ibsCbs?.ok ? { ibsCbs: ibsCbs.valor } : {}) } };
}

async function montarServicoAutomatico(contexto: Contexto, competencia: string, codigoNacionalId: string, codigoMunicipal: string, nbs: string): Promise<{ id: string } | EstadoPasso> {
  const erros: Erros = {};
  if (!codigoMunicipal) erros.codigoMunicipal = "Campo obrigatório";
  if (!nbs) erros.nbs = "Campo obrigatório";
  if (Object.keys(erros).length) return { erros };
  if ((await modoEmissao(contexto.empresa.id)).exigeRevisao) return { erros: { servico: "Esta empresa só emite com serviços revisados pelo escritório." } };
  const catalogo = await codigoDoCatalogo(codigoNacionalId);
  if (!catalogo) return { erros: { servico: "Código de tributação nacional não encontrado." } };
  // Confere o complemento de novo no ADN (o formulário não é fonte de verdade); a consulta fica em cache por algumas horas.
  let opcoes: MunicipalServiceOption[];
  try {
    opcoes = await discoverMunicipalServiceCodes({ organizationId: contexto.empresa.id, municipalityCode: contexto.empresa.municipio, nationalTaxCode: catalogo.code, competence: competencia });
  } catch (error) {
    return { erros: {}, mensagem: error instanceof SafeFiscalError ? error.safeMessage : "Não foi possível consultar os parâmetros do município agora." };
  }
  const opcao = opcoes.find((item) => item.code === codigoMunicipal);
  if (!opcao) return { erros: { codigoMunicipal: "Código complementar indisponível neste município" } };
  if (opcao.incidence !== "SIM") return { erros: { codigoMunicipal: "O município não cobra ISS neste código (sem incidência). Peça ao escritório para configurar." } };
  const montado = await ensureAutomaticService({ db: createAdminClient(), organizationId: contexto.empresa.id, municipalityCode: contexto.empresa.municipio, nationalServiceCodeId: catalogo.id, municipalServiceCode: opcao.code, nbsCode: nbs, createdBy: contexto.usuarioId, actorType: contexto.escritorio ? "OFFICE" : "CLIENT" });
  return montado.ok ? { id: montado.serviceId } : { erros: { servico: montado.erro } };
}

export async function salvarValores(rascunhoId: string, _anterior: EstadoPasso, formData: FormData): Promise<EstadoPasso> {
  const contexto = await empresaQueEmite();
  if (!contexto) return SEM_PERMISSAO;
  const rascunho = await carregarRascunho(contexto.empresa.id, rascunhoId);
  if (!rascunho?.dados.servico) return { erros: {}, mensagem: "Escolha o serviço no passo 2 antes." };
  const valores = await resolverValores(contexto, formData, { modeloId: rascunho.dados.servico.modeloId, substituicao: rascunho.dados.substituicao });
  if (!valores.ok) return valores.estado;
  await gravarRascunho({ empresaId: contexto.empresa.id, usuarioId: contexto.usuarioId, id: rascunhoId, passo: 4, dados: valores.dados });
  redirect(`/contribuinte/dps/${rascunhoId}/emitir`);
}

async function resolverValores(contexto: Contexto, formData: FormData, base: { modeloId: string; substituicao?: SubstituicaoRascunho }): Promise<Resolvido<{ valores: ValoresRascunho; substituicao?: SubstituicaoRascunho }>> {
  const servico = (await servicosProntos(contexto.empresa.id)).find((item) => item.id === base.modeloId);
  const exigeAliquota = Boolean(contexto.escritorio && servico?.exigeAliquotaManual);
  const substituicao = base.substituicao;
  // Na substituição o valor fica travado no da nota original (como no Emissor Nacional).
  const valor = substituicao ? centavosParaTexto(substituicao.valorCentavos) : texto(formData, "valor");
  const valores = validarValores({
    valor, aliquota: texto(formData, "aliquota"), fonte: texto(formData, "fonte"), exigeAliquota, descIncond: texto(formData, "descIncond"), descCond: texto(formData, "descCond"),
    federal: { cst: texto(formData, "cst") || "00", base: texto(formData, "basePisCofins"), pis: texto(formData, "aliqPis"), cofins: texto(formData, "aliqCofins"), retencao: texto(formData, "retencaoPisCofins"), irrf: texto(formData, "irrf"), cs: texto(formData, "cs"), cp: texto(formData, "cp") },
  });
  const motivo = substituicao ? validarMotivoSubstituicao({ codigo: texto(formData, "motivoCodigo"), motivo: texto(formData, "motivo") }) : null;
  if (!valores.ok || (motivo && !motivo.ok)) return { ok: false, estado: { erros: { ...(valores.ok ? {} : valores.erros), ...(motivo && !motivo.ok ? motivo.erros : {}) } } };
  return { ok: true, dados: { valores: valores.valor, ...(substituicao && motivo?.ok ? { substituicao: { ...substituicao, motivoCodigo: motivo.valor.motivoCodigo, motivo: motivo.valor.motivo } } : {}) } };
}

/**
 * Emissão rápida: os três passos numa tela só, com as mesmas regras (resolverPessoas, resolverServico e resolverValores).
 * Grava o rascunho já pronto para emitir e volta para a mesma tela, que passa a mostrar a revisão e o botão Emitir.
 * Tomador no exterior e substituição ficam na emissão completa.
 */
export async function salvarRapida(rascunhoId: string | null, _anterior: EstadoPasso, formData: FormData): Promise<EstadoPasso> {
  const contexto = await empresaQueEmite();
  if (!contexto) return SEM_PERMISSAO;
  const anterior = rascunhoId ? await carregarRascunho(contexto.empresa.id, rascunhoId) : null;
  if (rascunhoId && (!anterior || anterior.notaId || anterior.dados.substituicao)) return { erros: {}, mensagem: "Este rascunho não pode ser aberto na emissão rápida." };
  const pessoas = await resolverPessoas(contexto, formData);
  if (!pessoas.ok) return pessoas.estado;
  const campoIbs = (nome: string) => `ibs_${nome}`;
  const servico = await resolverServico(contexto, formData, { competencia: pessoas.dados.competencia, informarIbsCbs: pessoas.dados.informarIbsCbs, exterior: false, campoIbs });
  if (!servico.ok) return servico.estado;
  const pronto = (await servicosProntos(contexto.empresa.id)).find((item) => item.id === servico.dados.servico.modeloId);
  if (contexto.escritorio && pronto?.exigeAliquotaManual) return { erros: {}, mensagem: "Este serviço precisa da alíquota do ISS informada pelo escritório: use a emissão completa." };
  const valores = await resolverValores(contexto, formData, { modeloId: servico.dados.servico.modeloId });
  if (!valores.ok) return valores.estado;
  const dados: DadosRascunho = { ...pessoas.dados, ...servico.dados, ...valores.dados, rapida: true };
  const id = await gravarRascunho({ empresaId: contexto.empresa.id, usuarioId: contexto.usuarioId, id: rascunhoId, passo: 4, dados, substituir: true });
  redirect(`/contribuinte/rapida?r=${id}`);
}

export async function excluirRascunhoAction(formData: FormData) {
  const contexto = await empresaQueEmite();
  if (contexto) await excluirRascunho(contexto.empresa.id, texto(formData, "id"));
  redirect("/contribuinte/notas/rascunhos");
}

/** Chamado pela tela de emissão depois da resposta do motor. */
export async function registrarResultadoAction(rascunhoId: string, notaId: string, status: string) {
  const contexto = await empresaQueEmite();
  if (!contexto) return;
  await registrarResultado({ empresaId: contexto.empresa.id, id: rascunhoId, notaId, status, usuarioId: contexto.usuarioId });
}
