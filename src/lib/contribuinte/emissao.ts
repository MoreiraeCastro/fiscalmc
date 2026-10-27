import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { relationOne } from "@/lib/presentation/relations";
import { getServiceReadiness } from "@/lib/nfse/service-readiness";
import { resolveFiscalConfiguration } from "@/lib/nfse/fiscal-rule-resolver";
import { getConfiguredNFSeEnvironment } from "@/lib/nfse/environments";
import { getFiscalConfigurationReadiness, isFiscalProfileAccepted } from "@/lib/nfse/fiscal-configuration";
import { isAdnAutomaticService, isSelfSufficientService } from "@/lib/services/automatic-service";
import { ensureAutomaticTaxProfile } from "@/lib/organizations/automatic-tax-profile";
import type { DadosRascunho } from "./dps";

export const TRIBUTACAO_ISSQN: Record<string, string> = { "1": "Operação Tributável", "2": "Imunidade", "3": "Exportação de Serviço", "4": "Não Incidência" };
export const RETENCAO_ISSQN: Record<string, string> = { "1": "Não retido", "2": "Retido pelo Tomador", "3": "Retido pelo Intermediário" };
const OPCAO_SIMPLES: Record<string, string> = { "1": "Não Optante", "2": "Optante - Microempreendedor Individual (MEI)", "3": "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)" };
const APURACAO_SIMPLES: Record<string, string> = {
  "1": "Tributos federais e municipal pelo SN",
  "2": "Tributos federais pelo SN e ISSQN pela NFS-e",
  "3": "Tributos federais e municipal pela NFS-e",
};
const REGIME_ESPECIAL: Record<string, string> = { "0": "Nenhum", "1": "Ato Cooperado", "2": "Estimativa", "3": "Microempresa Municipal", "4": "Notário ou Registrador", "5": "Profissional Autônomo", "6": "Sociedade de Profissionais", "9": "Outros" };

export function ambienteEmissao() {
  return getConfiguredNFSeEnvironment() === "PRODUCTION" ? "PRODUCAO" as const : "RESTRITA" as const;
}

type RegimeTecnico = { simpleNational?: string; simpleAssessment?: string; special?: string };
function regimeDaConfiguracao(config: unknown): RegimeTecnico {
  const raiz = (config ?? {}) as { regime?: RegimeTecnico; technical?: { regime?: RegimeTecnico } };
  return raiz.technical?.regime ?? raiz.regime ?? {};
}

/** Bloco "EMITENTE DA NFS-E": o portal preenche sozinho a partir do cadastro; aqui vem do cadastro da empresa. */
export async function dadosEmitente(empresaId: string) {
  const db = createAdminClient();
  const [{ data: empresa }, { data: perfil }] = await Promise.all([
    db.from("organizations").select("legal_name,tax_id,municipal_registration,municipality_code,email,phone,postal_code,street,address_number,address_complement,neighborhood,state").eq("id", empresaId).single(),
    db.from("tax_profiles").select("tax_regime,dps_configuration").eq("organization_id", empresaId).maybeSingle(),
  ]);
  const regime = regimeDaConfiguracao(perfil?.dps_configuration);
  return {
    razaoSocial: empresa?.legal_name ?? "",
    cnpj: empresa?.tax_id ?? "",
    inscricaoMunicipal: empresa?.municipal_registration ?? null,
    municipio: empresa?.municipality_code ?? "",
    email: empresa?.email ?? null,
    telefone: empresa?.phone ?? null,
    endereco: [empresa?.street, empresa?.address_number, empresa?.address_complement, empresa?.neighborhood].filter(Boolean).join(", "),
    cep: empresa?.postal_code ?? null,
    opcaoSimples: regime.simpleNational ? OPCAO_SIMPLES[regime.simpleNational] ?? regime.simpleNational : perfil?.tax_regime === "SIMPLES_NACIONAL" ? "Optante" : "Não Optante",
    apuracaoSimples: regime.simpleAssessment ? APURACAO_SIMPLES[regime.simpleAssessment] ?? null : null,
    regimeEspecial: regime.special ? REGIME_ESPECIAL[regime.special] ?? regime.special : null,
    simples: regime.simpleNational ? regime.simpleNational !== "1" : perfil?.tax_regime === "SIMPLES_NACIONAL",
  };
}

export type ServicoPronto = {
  id: string; nome: string; codigo: string | null; descricaoCodigo: string | null; nbs: string | null;
  municipioPrestacao: string | null; descricaoPadrao: string | null; tributacao: string | null; exigeAliquotaManual: boolean;
  /** Para o passo 2 com a lista nacional: o código do catálogo, o código complementar municipal e se foi montado sozinho pelo ADN. */
  codigoNacionalId: string | null; codigoMunicipal: string | null; automatico: boolean;
};

/**
 * Como esta empresa emite. livre = "subiu o A1, está pronto" (lista nacional completa no passo 2, perfil automático vale);
 * exigeRevisao = só o que o escritório revisou (a chave "só serviços revisados" da empresa).
 * Cria o perfil fiscal automático se a empresa ainda não tiver nenhum.
 */
export async function modoEmissao(empresaId: string) {
  const db = createAdminClient();
  const { data: empresa } = await db.from("organizations").select("require_office_review").eq("id", empresaId).maybeSingle();
  const exigeRevisao = Boolean(empresa?.require_office_review);
  if (!exigeRevisao) await ensureAutomaticTaxProfile(db, empresaId);
  const { data: perfil } = await db.from("tax_profiles").select("tax_regime,dps_configuration,reviewed_at,reviewed_by,origin").eq("organization_id", empresaId).maybeSingle();
  const status = getFiscalConfigurationReadiness(perfil).status;
  return { exigeRevisao, perfilAceito: isFiscalProfileAccepted(status, exigeRevisao), perfilAutomatico: status === "AUTOMATIC" };
}

/** Serviços da empresa prontos para emitir: os do escritório e, se a empresa não exige revisão, os montados sozinhos pelo ADN. */
export async function servicosProntos(empresaId: string): Promise<ServicoPronto[]> {
  const db = createAdminClient();
  const [{ data }, { data: empresa }] = await Promise.all([
    db.from("service_templates")
      .select("id,name,default_description,active,workflow_status,auto_ready_source,national_service_code_id,national_tax_code,municipal_service_code,municipal_service_mapping_id,dps_municipal_tax_code,dps_municipal_tax_code_source,service_location_municipality_code,nbs_code,iss_taxation,iss_rate_source,fiscal_reference,reviewed_at,reviewed_by,national_service_codes(display_code,description)")
      .eq("organization_id", empresaId).eq("active", true).in("workflow_status", ["REVIEWED", "AUTO_READY"]).order("name"),
    db.from("organizations").select("require_office_review").eq("id", empresaId).maybeSingle(),
  ]);
  // Serviço do escritório sem código complementar não aparece: escolhendo o código no passo Serviço ele vira automático.
  // Empresa que exige revisão do escritório não tem o caminho automático, então lá ele continua valendo como está.
  return (data ?? []).filter((item) => getServiceReadiness(item).ready
    && (empresa?.require_office_review ? !isAdnAutomaticService(item) : isSelfSufficientService(item))).map((item) => {
    const codigo = relationOne(item.national_service_codes as { display_code: string; description: string } | { display_code: string; description: string }[] | null);
    return {
      id: item.id, nome: item.name, codigo: codigo?.display_code ?? item.national_tax_code, descricaoCodigo: codigo?.description ?? null,
      nbs: item.nbs_code, municipioPrestacao: item.service_location_municipality_code, descricaoPadrao: item.default_description,
      tributacao: item.iss_taxation, exigeAliquotaManual: item.iss_taxation !== "3" && item.iss_taxation !== "4" && item.iss_rate_source !== "PARAMETRIZED_BY_NATIONAL" && !item.municipal_service_mapping_id,
      codigoNacionalId: item.national_service_code_id, codigoMunicipal: item.municipal_service_code, automatico: isAdnAutomaticService(item),
    };
  });
}

export type CodigoNacional = { id: string; codigo: string; descricao: string };

let catalogoGuardado: { em: number; itens: CodigoNacional[] } | null = null;

/** Lista nacional de serviços (cTribNac, Anexo B), a mesma do campo "Código de Tributação Nacional" do Emissor Nacional. */
export async function catalogoNacional(): Promise<CodigoNacional[]> {
  if (catalogoGuardado && Date.now() - catalogoGuardado.em < 60 * 60 * 1000) return catalogoGuardado.itens;
  const { data } = await createAdminClient().from("national_service_codes").select("id,display_code,description").eq("active", true).order("display_code").limit(2000);
  const itens = (data ?? []).map((item) => ({ id: item.id, codigo: item.display_code, descricao: item.description }));
  if (itens.length) catalogoGuardado = { em: Date.now(), itens };
  return itens;
}

/** exterior: tomador no exterior (documento = NIF, pais = ISO do país). */
export type TomadorSalvo = { id: string; documento: string | null; nome: string; email: string | null; telefone: string | null; municipio: string | null; exterior?: { pais: string } };

/** "Últimos Tomadores": quem já está cadastrado para a empresa, do mais recente para o mais antigo. */
export async function tomadoresSalvos(empresaId: string): Promise<TomadorSalvo[]> {
  const { data } = await createAdminClient().from("customers").select("id,person_type,tax_id,foreign_tax_id,legal_name,email,phone,municipality_code,country_code")
    .eq("organization_id", empresaId).order("updated_at", { ascending: false }).limit(300);
  return (data ?? []).map((item) => item.person_type === "FOREIGN"
    ? { id: item.id, documento: item.foreign_tax_id, nome: item.legal_name, email: item.email, telefone: item.phone, municipio: null, exterior: { pais: item.country_code } }
    : { id: item.id, documento: item.tax_id, nome: item.legal_name, email: item.email, telefone: item.phone, municipio: item.municipality_code });
}

export async function tomadorPorId(empresaId: string, id: string) {
  const { data } = await createAdminClient().from("customers").select("id,person_type,tax_id,foreign_tax_id,no_foreign_tax_id_reason,legal_name,email,phone,municipality_code,postal_code,street,address_number,address_complement,neighborhood,state,city,foreign_postal_code,country_code")
    .eq("organization_id", empresaId).eq("id", id).maybeSingle();
  return data;
}

export type Previa = { tributacao: string; retencao: string; retido: boolean; aliquotaBp?: number; origemAliquota: string; aviso?: string };

/**
 * Tributação municipal que o motor vai usar, para mostrar nos passos 3 e 4 antes de emitir.
 * Usa a mesma regra da emissão (resolveFiscalConfiguration); se não der para calcular agora, avisa em vez de inventar.
 */
export async function previaTributacao(empresaId: string, dados: DadosRascunho): Promise<Previa | null> {
  if (!dados.servico || !dados.competencia) return null;
  const db = createAdminClient();
  const [{ data: empresa }, { data: perfil }, { data: servico }] = await Promise.all([
    db.from("organizations").select("municipality_code").eq("id", empresaId).single(),
    db.from("tax_profiles").select("tax_regime,reviewed_at,reviewed_by,dps_configuration,origin").eq("organization_id", empresaId).maybeSingle(),
    db.from("service_templates").select("national_tax_code,municipal_service_code,dps_municipal_tax_code,nbs_code,iss_taxation,iss_rate_source,fiscal_reference,workflow_status,auto_ready_source").eq("organization_id", empresaId).eq("id", dados.servico.modeloId).maybeSingle(),
  ]);
  const { data: org } = await db.from("organizations").select("require_office_review").eq("id", empresaId).maybeSingle();
  const exigeRevisao = Boolean(org?.require_office_review);
  const statusPerfil = perfil ? getFiscalConfigurationReadiness(perfil).status : "DRAFT";
  if (!empresa || !perfil || !servico) return null;
  const manual = dados.valores?.aliquotaManualBp !== undefined && dados.valores.fonteAliquota
    ? { manualRateBasisPoints: dados.valores.aliquotaManualBp, manualRateSourceNote: dados.valores.fonteAliquota } : {};
  try {
    const fiscal = await Promise.race([
      resolveFiscalConfiguration({
        organizationId: empresaId, municipalityCode: empresa.municipality_code, nationalTaxCode: servico.national_tax_code, municipalServiceCode: servico.municipal_service_code,
        dpsMunicipalTaxCode: servico.dps_municipal_tax_code, nbsCode: servico.nbs_code, issTaxation: servico.iss_taxation, issRateSource: servico.iss_rate_source,
        fiscalReference: servico.fiscal_reference, taxRegime: perfil.tax_regime, reviewedAt: perfil.reviewed_at, serviceDate: dados.competencia,
        automaticProfile: statusPerfil === "AUTOMATIC" && isFiscalProfileAccepted(statusPerfil, exigeRevisao), automaticService: !exigeRevisao && isAdnAutomaticService(servico), dpsConfiguration: perfil.dps_configuration, ...manual,
      }),
      new Promise<never>((_, rejeitar) => setTimeout(() => rejeitar(new Error("TIMEOUT")), 10_000)),
    ]);
    const retido = fiscal.iss.withholdingType !== "1";
    return {
      tributacao: TRIBUTACAO_ISSQN[fiscal.iss.taxation] ?? fiscal.iss.taxation,
      retencao: RETENCAO_ISSQN[fiscal.iss.withholdingType] ?? fiscal.iss.withholdingType,
      retido,
      aliquotaBp: fiscal.iss.rateBasisPoints ?? fiscal.iss.parametrizedRateBasisPoints,
      origemAliquota: fiscal.iss.source === "OFFICE_PARAMETER" ? "informada pelo escritório" : fiscal.iss.rateBasisPoints === undefined ? "parâmetros do município (a Receita aplica na emissão)" : "parâmetros do município",
    };
  } catch {
    return {
      tributacao: servico.iss_taxation ? TRIBUTACAO_ISSQN[servico.iss_taxation] ?? servico.iss_taxation : "—", retencao: "—", retido: false, origemAliquota: "—",
      aviso: "Não foi possível calcular a prévia agora. A emissão ainda confere tudo de novo antes de transmitir.",
    };
  }
}

/** Serviço e descrição da última nota emitida pela empresa, para já virem escolhidos na emissão rápida. */
export async function ultimoServicoUsado(empresaId: string): Promise<{ modeloId: string; descricao: string } | null> {
  const { data } = await createAdminClient().from("invoices").select("service_template_id,description")
    .eq("organization_id", empresaId).in("status", ["ISSUED", "CANCELLED"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.service_template_id ? { modeloId: data.service_template_id, descricao: data.description ?? "" } : null;
}
