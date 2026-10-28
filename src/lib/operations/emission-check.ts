import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFiscalDocument } from "@/lib/nfse/issuance/domain";
import { resolveFiscalConfiguration, type FiscalResolution } from "@/lib/nfse/fiscal-rule-resolver";
import { prepareRestrictedDps } from "@/lib/nfse/issuance/prepare-restricted-dps";
import { NationalNFSeProvider } from "@/lib/nfse/issuance/national-provider";
import { getFiscalConfigurationReadiness, isFiscalProfileAccepted } from "@/lib/nfse/fiscal-configuration";
import { getCertificateReadiness } from "@/lib/nfse/certificate/status";
import { getServiceReadiness } from "@/lib/nfse/service-readiness";
import { discoverMunicipalServiceCodes } from "@/lib/nfse/municipal-parameters/discovery";
import { isAdnAutomaticService, isSelfSufficientService, dpsMunicipalTaxCodeFrom } from "@/lib/services/automatic-service";
import { resolveCnaeActivity } from "@/lib/organizations/cnae-activity-resolver";
import { nbsForLc116 } from "@/lib/organizations/nbs-activity-resolver";
import { IBS_CBS_PADRAO } from "@/lib/nfse/ibs-cbs";
import { SafeFiscalError } from "@/lib/nfse/errors";
import { problemGuide, sefinText } from "@/lib/operations/emission-problems";

/**
 * Teste de emissão de uma empresa: o caminho inteiro da primeira nota, sem emitir nada com valor fiscal.
 * Cadastro → certificado → conexão com o sistema nacional (produção, só leitura) → configuração fiscal → serviço →
 * DPS de ensaio (montada, validada e assinada) → nota de teste na Produção Restrita (pega o que só a Receita recusa).
 * Roda sozinho quando o certificado é cadastrado e pelo botão na ficha da empresa; o resultado fica no histórico.
 */

export type CheckStatus = "ok" | "warn" | "fail" | "skip";
export type CheckStepKey = "cadastro" | "certificado" | "conexao" | "fiscal" | "servico" | "ensaio" | "restrita";
export type CheckStep = { key: CheckStepKey; status: CheckStatus; detail: string; fix?: string };
export type EmissionCheck = { ok: boolean; at: string; steps: CheckStep[] };

export const CHECK_STEP_LABEL: Record<CheckStepKey, string> = {
  cadastro: "Cadastro da empresa",
  certificado: "Certificado A1",
  conexao: "Conexão com o sistema nacional",
  fiscal: "Configuração fiscal",
  servico: "Serviço e alíquota do município",
  ensaio: "Nota de ensaio (montada e assinada)",
  restrita: "Nota de teste na Produção Restrita",
};

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const message = (error: unknown) => (error instanceof SafeFiscalError ? error.safeMessage : error instanceof Error ? error.message : String(error));
const isTlsRejection = (error: unknown) => /ERR_SSL|mTLS|certificate|handshake/i.test(`${(error as { code?: string })?.code ?? ""} ${message(error)}`);

type ServiceRow = Record<string, unknown> & { national_tax_code: string; nbs_code: string | null };

export async function runEmissionCheck(organizationId: string, input: { actorUserId: string | null; actorType?: "OFFICE" | "SYSTEM"; restricted?: boolean }): Promise<EmissionCheck> {
  const db = createAdminClient();
  const steps: CheckStep[] = [];
  const add = (step: CheckStep) => { steps.push(step); return step.status !== "fail"; };
  const skipRest = (from: CheckStepKey[]) => { for (const key of from) if (!steps.some((s) => s.key === key)) steps.push({ key, status: "skip", detail: "Não testado: um passo anterior falhou." }); };
  const competence = today();

  const [{ data: org }, { data: profile }, { data: certificate }, { data: services }, { data: customers }] = await Promise.all([
    db.from("organizations").select("*").eq("id", organizationId).maybeSingle(),
    db.from("tax_profiles").select("tax_regime,reviewed_at,reviewed_by,iss_configuration,dps_configuration,origin").eq("organization_id", organizationId).maybeSingle(),
    db.from("digital_certificates").select("status,owner_tax_id,valid_until").eq("organization_id", organizationId).is("replaced_at", null).maybeSingle(),
    db.from("service_templates").select("id,name,active,workflow_status,auto_ready_source,national_service_code_id,national_tax_code,municipal_service_code,municipal_service_mapping_id,dps_municipal_tax_code,dps_municipal_tax_code_source,service_location_municipality_code,nbs_code,iss_taxation,iss_rate_source,fiscal_reference,reviewed_at,reviewed_by,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }),
    db.from("customers").select("*").eq("organization_id", organizationId).eq("person_type", "COMPANY").not("postal_code", "is", null).not("municipality_code", "is", null).limit(1),
  ]);
  if (!org) return { ok: false, at: new Date().toISOString(), steps: [{ key: "cadastro", status: "fail", detail: "Empresa não encontrada." }] };

  // 1. Cadastro
  const address = Boolean(org.street && org.address_number && org.neighborhood && org.state && org.postal_code);
  add(!org.municipality_code || !org.tax_id ? { key: "cadastro", status: "fail", detail: "Falta CNPJ ou município da empresa.", fix: "Complete o cadastro em Visão geral." }
    : !address ? { key: "cadastro", status: "warn", detail: "Endereço incompleto (não impede a emissão).", fix: "Vale completar o endereço da empresa." }
    : { key: "cadastro", status: "ok", detail: `Município ${org.municipality_code}${org.municipal_registration ? `, inscrição municipal ${org.municipal_registration}` : ", sem inscrição municipal"}.` });

  // 2. Certificado
  const certReadiness = getCertificateReadiness({ certificate, organizationTaxId: org.tax_id });
  const daysLeft = certificate?.valid_until ? Math.floor((new Date(certificate.valid_until).getTime() - Date.now()) / 864e5) : null;
  const certOk = add(!certReadiness.ready ? { key: "certificado", status: "fail", detail: certReadiness.message, fix: "Envie o certificado A1 da empresa na aba Certificado." }
    : daysLeft !== null && daysLeft <= 30 ? { key: "certificado", status: "warn", detail: `Válido, mas vence em ${daysLeft} dia(s).`, fix: "Peça o novo certificado ao cliente." }
    : { key: "certificado", status: "ok", detail: `Válido${daysLeft !== null ? ` por mais ${daysLeft} dias` : ""} e do CNPJ da empresa.` });

  // 3. Configuração fiscal (sem serviço ainda: só o perfil)
  const fiscalReadiness = profile ? getFiscalConfigurationReadiness(profile as never) : null;
  const fiscalAccepted = fiscalReadiness ? isFiscalProfileAccepted(fiscalReadiness.status, Boolean(org.require_office_review)) : false;
  if (!profile || !fiscalAccepted) {
    add({ key: "fiscal", status: "fail", detail: "A configuração fiscal ainda não foi confirmada.", fix: "Confirme em Dados fiscais." });
  }

  // 4. Serviço: o pronto do escritório, senão o que a tela montaria (código do serviço cadastrado ou do CNAE).
  let service: ServiceRow | null = null;
  let automatic = false;
  let origin = "";
  const ready = (services ?? []).find((s) => s.active && ["REVIEWED", "AUTO_READY"].includes(s.workflow_status as string) && getServiceReadiness(s as never).ready && (isSelfSufficientService(s) || isAdnAutomaticService(s)));
  let baseCode: string | null = null;
  let baseNbs: string | null = null;
  if (ready) { service = ready as ServiceRow; automatic = isAdnAutomaticService(ready); origin = automatic ? "serviço automático" : "serviço do escritório"; }
  else {
    const base = [...(services ?? [])].sort((a, b) => Number(b.active) - Number(a.active))[0];
    if (base) { baseCode = base.national_tax_code as string; baseNbs = (base.nbs_code as string) ?? null; origin = `código do serviço "${base.name}"`; }
    else if (org.cnae_fiscal_code) {
      const cnae = await resolveCnaeActivity(db, org.cnae_fiscal_code as string);
      if (cnae.candidates[0]) { baseCode = cnae.candidates[0].code; origin = `código sugerido pelo CNAE ${cnae.cnae}`; }
    }
  }

  let fiscal: FiscalResolution | null = null;
  if (certOk) {
    try {
      if (!service && baseCode) {
        const options = await discoverMunicipalServiceCodes({ organizationId, municipalityCode: org.municipality_code, nationalTaxCode: baseCode, competence });
        add({ key: "conexao", status: "ok", detail: "O sistema nacional (produção) aceitou o certificado." });
        const option = options.find((o) => o.incidence === "SIM");
        if (!option) {
          add({ key: "servico", status: "fail", detail: `O município não tem código complementar com ISS para ${baseCode} (${origin}).`, fix: "Confira o código do serviço ou peça ao escritório para configurar." });
        } else {
          const lc = baseCode.padStart(6, "0");
          const nbs = baseNbs ?? nbsForLc116(lc.slice(0, 2), lc.slice(2, 4)).find((n) => n.oficial)?.nbsCode ?? null;
          automatic = true;
          service = { national_tax_code: baseCode, municipal_service_code: option.code, dps_municipal_tax_code: dpsMunicipalTaxCodeFrom(option.code), service_location_municipality_code: org.municipality_code, nbs_code: nbs, iss_taxation: "1", iss_rate_source: "PARAMETRIZED_BY_NATIONAL", fiscal_reference: {} };
          add({ key: "servico", status: nbs ? "ok" : "warn", detail: `${option.code} · ISS ${(option.rateBasisPoints / 100).toLocaleString("pt-BR")}% no município (${origin}).`, ...(nbs ? {} : { fix: "Escolha a NBS no passo Serviço da primeira nota." }) });
        }
      } else if (service) {
        // Serviço pronto: a conexão é testada consultando o próprio código no município.
        await discoverMunicipalServiceCodes({ organizationId, municipalityCode: org.municipality_code, nationalTaxCode: service.national_tax_code, competence });
        add({ key: "conexao", status: "ok", detail: "O sistema nacional (produção) aceitou o certificado." });
        add({ key: "servico", status: "ok", detail: `${service.municipal_service_code ?? service.national_tax_code} · NBS ${service.nbs_code ?? "—"} (${origin}).` });
      } else {
        add({ key: "conexao", status: "skip", detail: "Sem serviço para consultar." });
        add({ key: "servico", status: "fail", detail: "Nenhum serviço cadastrado e o CNAE não indica um código.", fix: "Cadastre o serviço na aba Serviços (ou escolha o código na primeira nota)." });
      }
    } catch (error) {
      add({ key: "conexao", status: "fail", detail: isTlsRejection(error) ? "O sistema nacional recusou a conexão com este certificado." : message(error), fix: "Confira o certificado A1 (senha, validade) e tente de novo em alguns minutos." });
    }
  }

  if (service && profile && fiscalAccepted) {
    try {
      fiscal = await resolveFiscalConfiguration({ organizationId, municipalityCode: org.municipality_code, nationalTaxCode: service.national_tax_code, municipalServiceCode: service.municipal_service_code as string | null, dpsMunicipalTaxCode: service.dps_municipal_tax_code as string | null, nbsCode: service.nbs_code, issTaxation: service.iss_taxation as never, issRateSource: service.iss_rate_source as never, fiscalReference: service.fiscal_reference, taxRegime: profile.tax_regime as never, reviewedAt: profile.reviewed_at as string | null, automaticProfile: fiscalReadiness?.status === "AUTOMATIC", automaticService: automatic, serviceDate: competence, dpsConfiguration: profile.dps_configuration });
      const regime = fiscal.dpsConfiguration.regime;
      add({ key: "fiscal", status: "ok", detail: `${String(profile.tax_regime ?? "").replaceAll("_", " ")}${regime.simpleNational === "3" ? `, ME/EPP (apuração ${regime.simpleAssessment})` : ""}; ISS ${fiscal.iss.rateBasisPoints !== undefined ? `${fiscal.iss.rateBasisPoints / 100}%` : "pela alíquota do município"}.` });
    } catch (error) {
      add({ key: "fiscal", status: "fail", detail: message(error), fix: "Corrija em Dados fiscais ou Serviços e rode o teste de novo." });
    }
  }

  // 5. DPS de ensaio (leiaute de produção) e 6. nota de teste na restrita, com um tomador PJ com endereço.
  if (fiscal && service) {
    const tomadorRow = customers?.[0] ?? (await db.from("customers").select("*").eq("person_type", "COMPANY").not("postal_code", "is", null).not("municipality_code", "is", null).neq("tax_id", org.tax_id).limit(1)).data?.[0] ?? null;
    const issuerInput = { legalName: org.legal_name, taxId: org.tax_id, municipalRegistration: org.municipal_registration ?? "", municipalityCode: org.municipality_code, postalCode: org.postal_code ?? "", street: org.street ?? "", addressNumber: org.address_number ?? "", addressComplement: org.address_complement, neighborhood: org.neighborhood ?? "", state: org.state ?? "", email: org.email, phone: org.phone };
    const customerInput = tomadorRow ? { personType: tomadorRow.person_type, taxId: tomadorRow.tax_id, legalName: tomadorRow.legal_name, municipalRegistration: tomadorRow.municipal_registration, postalCode: tomadorRow.postal_code, street: tomadorRow.street, addressNumber: tomadorRow.address_number, addressComplement: tomadorRow.address_complement, neighborhood: tomadorRow.neighborhood, municipalityCode: tomadorRow.municipality_code, state: tomadorRow.state, countryCode: tomadorRow.country_code, email: tomadorRow.email, phone: tomadorRow.phone } : undefined;
    const fiscalForDps = { regime: fiscal.dpsConfiguration.regime, iss: { taxation: fiscal.iss.taxation, withholding: fiscal.iss.withholdingType, rateSource: fiscal.iss.rateSource, ...(fiscal.iss.rateBasisPoints !== undefined ? { rateBasisPoints: fiscal.iss.rateBasisPoints } : {}), ...(fiscal.dpsConfiguration.iss.benefitNumber ? { benefit: { number: fiscal.dpsConfiguration.iss.benefitNumber } } : {}) }, totalTaxes: fiscal.dpsConfiguration.totalTaxes };
    const document = (dpsNumber: bigint, dpsSeries: string) => buildFiscalDocument({ organization: { id: organizationId, taxId: org.tax_id, municipalRegistration: org.municipal_registration ?? "", municipalityCode: org.municipality_code }, customer: tomadorRow ? { taxId: tomadorRow.tax_id, legalName: tomadorRow.legal_name } : { legalName: "Tomador não informado" }, service: { nationalTaxCode: service!.national_tax_code, municipalServiceCode: fiscal!.municipalServiceCode }, taxConfiguration: { regime: profile!.tax_regime as never, taxationType: "MUNICIPAL", iss: { rateBasisPoints: fiscal!.iss.rateBasisPoints, withheld: fiscal!.iss.withholdingType !== "1", source: fiscal!.iss.source }, ibsCbs: { customerFieldsEnabled: false } }, amountCents: 1000, serviceDate: competence, description: "Teste de emissão do escritório (sem valor fiscal)", dpsNumber, dpsSeries });
    const prepare = (environment: "PRODUCTION" | "PRODUCTION_RESTRICTED", doc: ReturnType<typeof document>, withIbsCbs: boolean) => prepareRestrictedDps({
      organizationId, environment, document: doc, organization: issuerInput, ...(customerInput ? { customer: customerInput } : {}),
      service: { nationalTaxCode: service!.national_tax_code, dpsMunicipalTaxCode: (service!.dps_municipal_tax_code as string) ?? "", nbsCode: service!.nbs_code, locationMunicipalityCode: (service!.service_location_municipality_code as string) ?? org.municipality_code },
      fiscal: fiscalForDps, issuerMunicipalRegistrationEmission: fiscal!.issuerMunicipalRegistrationEmission, ...(withIbsCbs ? { ibsCbs: IBS_CBS_PADRAO } : {}),
    } as never);

    let ensaioOk = false;
    try {
      await prepare("PRODUCTION", document(999_999_999_999_999n, "00000"), false);
      ensaioOk = add({ key: "ensaio", status: "ok", detail: "A DPS de produção foi montada, passou no XSD oficial e foi assinada com o A1. Nada foi enviado." });
    } catch (error) {
      add({ key: "ensaio", status: "fail", detail: message(error), fix: "Avise o programador com este resultado." });
    }

    if (ensaioOk && input.restricted !== false) {
      if (!customerInput) add({ key: "restrita", status: "skip", detail: "Sem tomador PJ com endereço para a nota de teste." });
      else try {
        const doc = document(BigInt(900_000_000 + Math.floor(Math.random() * 99_999_999)), "00900");
        const prepared = await prepare("PRODUCTION_RESTRICTED", doc, true);
        const result = await new NationalNFSeProvider().transmitRestrictedTest({ document: doc, idempotencyKey: crypto.randomUUID(), organizationId, preparedPayload: (prepared as { preparedPayload: unknown }).preparedPayload } as never);
        if (result.status === "ISSUED") add({ key: "restrita", status: "ok", detail: `A Receita autorizou a nota de teste (nº ${result.nfseNumber} na Produção Restrita, sem valor fiscal).` });
        else if (result.status === "REJECTED") {
          const guide = problemGuide(result.code, "RECEITA");
          add({ key: "restrita", status: "fail", detail: `A Receita recusou: ${result.code} - ${sefinText(result.safeMessage, result.code) || guide.titulo}`, fix: guide.oQueFazer });
        } else add({ key: "restrita", status: "warn", detail: "A Produção Restrita não confirmou a nota de teste agora.", fix: "Rode o teste de novo em alguns minutos." });
      } catch (error) {
        add(isTlsRejection(error)
          ? { key: "restrita", status: "warn", detail: "A Produção Restrita não aceita este certificado (acontece com algumas certificadoras). A conexão de produção funcionou, então a emissão real não é afetada." }
          : { key: "restrita", status: "warn", detail: `Não foi possível enviar a nota de teste: ${message(error)}`, fix: "Rode o teste de novo em alguns minutos." });
      }
    }
  }
  skipRest(["conexao", "fiscal", "servico", "ensaio", "restrita"]);
  const order = Object.keys(CHECK_STEP_LABEL) as CheckStepKey[];
  steps.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  const result: EmissionCheck = { ok: !steps.some((s) => s.status === "fail"), at: new Date().toISOString(), steps };
  await db.from("audit_logs").insert({ organization_id: organizationId, actor_user_id: input.actorUserId, actor_type: input.actorType ?? "OFFICE", action: "emission_check", entity: "organization", entity_id: organizationId, safe_metadata: { ok: result.ok, steps } });
  return result;
}

/** Último teste de emissão da empresa (do histórico), para a ficha. */
export async function lastEmissionCheck(organizationId: string): Promise<EmissionCheck | null> {
  const { data } = await createAdminClient().from("audit_logs").select("created_at,safe_metadata").eq("organization_id", organizationId).eq("action", "emission_check").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const meta = data.safe_metadata as { ok?: boolean; steps?: CheckStep[] };
  return { ok: Boolean(meta.ok), at: data.created_at, steps: meta.steps ?? [] };
}
