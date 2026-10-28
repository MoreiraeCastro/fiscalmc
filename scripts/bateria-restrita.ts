// Bateria de emissão na Produção Restrita, com o A1 de cada empresa, pelo mesmo caminho da tela
// (serviço → regra fiscal → DPS → XSD → assinatura → SEFIN). Não grava nota no banco.
// Rodar no servidor: NFSE_ENV=PRODUCTION_RESTRICTED ENABLE_NFSE_PRODUCTION=false ENABLE_NFSE_RESTRICTED_TRANSMISSION=true \
//   npx tsx --env-file=.env.local --import ./scripts/server-only-shim.mjs scripts/bateria-restrita.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFiscalDocument } from "@/lib/nfse/issuance/domain";
import { resolveFiscalConfiguration } from "@/lib/nfse/fiscal-rule-resolver";
import { prepareRestrictedDps } from "@/lib/nfse/issuance/prepare-restricted-dps";
import { getNFSeProvider } from "@/lib/nfse/issuance/provider";
import { getFiscalConfigurationReadiness, isFiscalProfileAccepted } from "@/lib/nfse/fiscal-configuration";
import { getServiceReadiness } from "@/lib/nfse/service-readiness";
import { isAdnAutomaticService, isSelfSufficientService, dpsMunicipalTaxCodeFrom } from "@/lib/services/automatic-service";
import { discoverMunicipalServiceCodes } from "@/lib/nfse/municipal-parameters/discovery";
import { IBS_CBS_PADRAO } from "@/lib/nfse/ibs-cbs";
import { SafeFiscalError } from "@/lib/nfse/errors";

if (process.env.NFSE_ENV !== "PRODUCTION_RESTRICTED" || process.env.ENABLE_NFSE_PRODUCTION === "true") throw new Error("Só roda na Produção Restrita.");

const db = createAdminClient();
const HOJE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const only = process.argv[2];
type Row = Record<string, unknown>;

async function servicoDaEmpresa(org: Row) {
  const { data: services } = await db.from("service_templates").select("id,name,active,workflow_status,auto_ready_source,national_service_code_id,national_tax_code,municipal_service_code,municipal_service_mapping_id,dps_municipal_tax_code,service_location_municipality_code,nbs_code,iss_taxation,iss_rate_source,fiscal_reference,reviewed_at,reviewed_by").eq("organization_id", org.id as string);
  const prontos = (services ?? []).filter((s) => s.active && ["REVIEWED", "AUTO_READY"].includes(s.workflow_status) && getServiceReadiness(s as never).ready && (isSelfSufficientService(s) || isAdnAutomaticService(s)));
  if (prontos.length) return { origem: isAdnAutomaticService(prontos[0]) ? "automático" : "escritório", automatico: isAdnAutomaticService(prontos[0]), s: prontos[0] };
  // Como a tela faria: caminho automático pelo código nacional do serviço que existe (mesmo inativo), NBS escolhida.
  const base = [...(services ?? [])].sort((x, y) => Number(y.active) - Number(x.active))[0];
  if (!base) return null;
  const opcoes = await discoverMunicipalServiceCodes({ organizationId: org.id as string, municipalityCode: org.municipality_code as string, nationalTaxCode: base.national_tax_code, competence: HOJE });
  const opcao = opcoes.find((o) => o.incidence === "SIM");
  if (!opcao) return { erro: `município sem código complementar com incidência para ${base.national_tax_code} (${opcoes.length} opções)` };
  const nbs = base.national_tax_code.startsWith("04") ? "123019900" : base.nbs_code;
  return { origem: `automático simulado (${opcao.code}, ISS ${opcao.rateBasisPoints / 100}%)`, automatico: true, s: { ...base, municipal_service_code: opcao.code, dps_municipal_tax_code: dpsMunicipalTaxCodeFrom(opcao.code), service_location_municipality_code: org.municipality_code, nbs_code: nbs, iss_taxation: "1", iss_rate_source: "PARAMETRIZED_BY_NATIONAL", fiscal_reference: {} } };
}

async function emitir(org: Row, profile: Row, servico: { automatico: boolean; s: Row }, customer: Row | null, cenario: string) {
  const s = servico.s;
  const fiscalReadiness = getFiscalConfigurationReadiness(profile as never);
  const fiscalAccepted = isFiscalProfileAccepted(fiscalReadiness.status, Boolean(org.require_office_review));
  const fiscal = await resolveFiscalConfiguration({ organizationId: org.id as string, municipalityCode: org.municipality_code as string, nationalTaxCode: s.national_tax_code as string, municipalServiceCode: s.municipal_service_code as string | null, dpsMunicipalTaxCode: s.dps_municipal_tax_code as string | null, nbsCode: s.nbs_code as string | null, issTaxation: s.iss_taxation as never, issRateSource: s.iss_rate_source as never, fiscalReference: s.fiscal_reference, taxRegime: profile.tax_regime as never, reviewedAt: profile.reviewed_at as string | null, automaticProfile: fiscalAccepted && fiscalReadiness.status === "AUTOMATIC", automaticService: servico.automatico, serviceDate: HOJE, dpsConfiguration: profile.dps_configuration });
  const dpsNumber = BigInt(900_000_000 + Math.floor(Math.random() * 99_999_999));
  const document = buildFiscalDocument({ organization: { id: org.id as string, taxId: org.tax_id as string, municipalRegistration: (org.municipal_registration as string) ?? "", municipalityCode: org.municipality_code as string }, customer: customer ? { taxId: customer.tax_id as string, legalName: customer.legal_name as string } : { legalName: "Tomador não informado" }, service: { nationalTaxCode: s.national_tax_code as string, municipalServiceCode: fiscal.municipalServiceCode }, taxConfiguration: { regime: profile.tax_regime as never, taxationType: "MUNICIPAL", iss: { rateBasisPoints: fiscal.iss.rateBasisPoints, withheld: fiscal.iss.withholdingType !== "1", source: fiscal.iss.source }, ibsCbs: { customerFieldsEnabled: false } }, amountCents: 1000, serviceDate: HOJE, description: `Teste de integração (bateria ${cenario})`, dpsNumber, dpsSeries: "00900" });
  const fiscalForDps = { regime: fiscal.dpsConfiguration.regime, iss: { taxation: fiscal.iss.taxation, withholding: fiscal.iss.withholdingType, rateSource: fiscal.iss.rateSource, ...(fiscal.iss.rateBasisPoints !== undefined ? { rateBasisPoints: fiscal.iss.rateBasisPoints } : {}), ...(fiscal.dpsConfiguration.iss.benefitNumber ? { benefit: { number: fiscal.dpsConfiguration.iss.benefitNumber } } : {}) }, totalTaxes: fiscal.dpsConfiguration.totalTaxes };
  let stage = "";
  const prepared = await prepareRestrictedDps({ organizationId: org.id as string, environment: "PRODUCTION_RESTRICTED", document, onStage: (st: string) => { stage = st; },
    organization: { legalName: org.legal_name as string, taxId: org.tax_id as string, municipalRegistration: (org.municipal_registration as string) ?? "", municipalityCode: org.municipality_code as string, postalCode: (org.postal_code as string) ?? "", street: (org.street as string) ?? "", addressNumber: (org.address_number as string) ?? "", addressComplement: org.address_complement as string | null, neighborhood: (org.neighborhood as string) ?? "", state: (org.state as string) ?? "", email: org.email as string | null, phone: org.phone as string | null },
    customer: customer ? { personType: customer.person_type as string, taxId: customer.tax_id as string | null, legalName: customer.legal_name as string, municipalRegistration: customer.municipal_registration as string | null, postalCode: customer.postal_code as string | null, street: customer.street as string | null, addressNumber: customer.address_number as string | null, addressComplement: customer.address_complement as string | null, neighborhood: customer.neighborhood as string | null, municipalityCode: customer.municipality_code as string | null, state: customer.state as string | null, countryCode: customer.country_code as string | null, email: customer.email as string | null, phone: customer.phone as string | null, foreignTaxId: customer.foreign_tax_id as string | null, noForeignTaxIdReason: customer.no_foreign_tax_id_reason as string | null, city: customer.city as string | null, foreignPostalCode: customer.foreign_postal_code as string | null } as never : undefined,
    service: { nationalTaxCode: s.national_tax_code as string, dpsMunicipalTaxCode: (s.dps_municipal_tax_code as string) ?? "", nbsCode: s.nbs_code as string | null, locationMunicipalityCode: (s.service_location_municipality_code as string) ?? (org.municipality_code as string) },
    fiscal: fiscalForDps as never, issuerMunicipalRegistrationEmission: fiscal.issuerMunicipalRegistrationEmission, ibsCbs: IBS_CBS_PADRAO as never,
  } as never).catch((error) => { throw Object.assign(error, { stage }); });
  const result = await getNFSeProvider().issue({ document, idempotencyKey: crypto.randomUUID(), organizationId: org.id as string, preparedPayload: prepared.preparedPayload } as never);
  return { fiscal: `ISS ${fiscal.iss.taxation}/${fiscal.iss.rateSource}${fiscal.iss.rateBasisPoints !== undefined ? ` ${fiscal.iss.rateBasisPoints / 100}%` : " (alíquota do município)"}`, result };
}

const { data: orgs } = await db.from("organizations").select("*").order("legal_name");
for (const org of orgs ?? []) {
  if (only && !String(org.legal_name).toLowerCase().includes(only.toLowerCase())) continue;
  console.log(`\n=== ${org.legal_name} (${org.municipality_code})`);
  const [{ data: profile }, { data: customers }, { data: mc }] = await Promise.all([
    db.from("tax_profiles").select("tax_regime,reviewed_at,reviewed_by,iss_configuration,dps_configuration,origin").eq("organization_id", org.id).maybeSingle(),
    db.from("customers").select("*").eq("organization_id", org.id).limit(50),
    db.from("customers").select("*").neq("organization_id", org.id).eq("person_type", "COMPANY").not("street", "is", null).limit(1),
  ]);
  if (!profile) { console.log("  SEM PERFIL FISCAL"); continue; }
  if (process.env.FORCAR_APURACAO_SN) { const c = profile.dps_configuration as any; const t = c.technical ?? c; t.regime = { ...t.regime, simpleAssessment: t.regime.simpleAssessment ?? "1" }; console.log("  (teste: regApTribSN=1 só na memória)"); }
  let servico;
  try { servico = await servicoDaEmpresa(org); } catch (error) { console.log("  serviço: ERRO", error instanceof SafeFiscalError ? `${error.code} ${error.safeMessage}` : String(error)); continue; }
  if (!servico) { console.log("  SEM SERVIÇO"); continue; }
  if ("erro" in servico) { console.log("  serviço:", servico.erro); continue; }
  console.log(`  serviço: ${servico.s.national_tax_code} ${servico.s.municipal_service_code ?? "-"} NBS ${servico.s.nbs_code} · ${servico.origem}`);
  const pj = (customers ?? []).find((c) => c.person_type === "COMPANY") ?? (mc ?? [])[0] ?? null;
  const pf = (customers ?? []).find((c) => c.person_type === "INDIVIDUAL") ?? null;
  const cenarios: Array<[string, Row | null]> = [["tomador PJ", pj], ["sem tomador", null], ...(pf ? [["tomador PF", pf] as [string, Row]] : [])];
  for (const [nome, customer] of cenarios) {
    try {
      const { fiscal, result } = await emitir(org, profile, servico as never, customer, nome);
      const r = result as { status: string; code?: string; safeMessage?: string; nfseNumber?: string; accessKey?: string };
      console.log(`  [${nome}${customer ? `: ${customer.legal_name}` : ""}] ${fiscal} → ${r.status}${r.status === "ISSUED" ? ` nº ${r.nfseNumber}` : ` ${r.code ?? ""} ${r.safeMessage ?? ""}`}`);
    } catch (error) {
      const e = error as SafeFiscalError & { stage?: string; xsdDiagnostic?: unknown };
      console.log(`  [${nome}] ERRO na etapa ${e.stage || "-"}: ${e.code ?? ""} ${e.safeMessage ?? e.message}${e.xsdDiagnostic ? ` ${JSON.stringify(e.xsdDiagnostic)}` : ""}`);
    }
  }
}
