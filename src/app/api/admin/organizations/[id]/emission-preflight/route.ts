import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOfficeSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/security/authorization";
import { getFiscalConfigurationReadiness } from "@/lib/nfse/fiscal-configuration";
import { getServiceReadiness } from "@/lib/nfse/service-readiness";
import { getCertificateReadiness } from "@/lib/nfse/certificate/status";
import { createClientAccessService } from "@/lib/auth/client-access-service";
import { getOrganizationReadiness } from "@/lib/organizations/readiness";
import { buildFiscalDocument } from "@/lib/nfse/issuance/domain";
import { prepareRestrictedDps, type RestrictedDpsPreparationStage } from "@/lib/nfse/issuance/prepare-restricted-dps";
import { resolveFiscalConfiguration } from "@/lib/nfse/fiscal-rule-resolver";
import { decodeDpsFromSefin } from "@/lib/nfse/dps/encoding";
import { MunicipalParametersProvider } from "@/lib/nfse/municipal-parameters/client";
import { MtlsHttpClient } from "@/lib/nfse/client/mtls-http-client";
import { OrganizationCertificateProvider } from "@/lib/nfse/certificate/organization-provider";
import { endpoints, municipalParametersEndpoints } from "@/lib/nfse/environments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const organizationIdSchema = z.string().uuid();
const DRY_RUN_SERIES = "00000";
const DRY_RUN_NUMBER = 999999999999999n;
const digits = (value: string) => value.replace(/\D/g, "");
const operationSchema = z.object({
  serviceTemplateId: z.string().uuid(),
  customer: z.object({
    taxId: z.string().transform(digits).refine((value) => value.length === 14),
    legalName: z.string().trim().min(2).max(180),
    street: z.string().trim().min(2).max(120),
    addressNumber: z.string().trim().min(1).max(20),
    neighborhood: z.string().trim().min(2).max(100),
    postalCode: z.string().transform(digits).refine((value) => value.length === 8),
    municipalityCode: z.string().regex(/^\d{7}$/),
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  }).strict(),
  amountCents: z.number().int().positive(),
  competence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(5).max(2_000),
  targetEnvironment: z.enum(["PRODUCTION_RESTRICTED", "PRODUCTION"]).optional().default("PRODUCTION_RESTRICTED"),
}).strict();
type PreflightStage = "AUTH" | "LOAD_CONFIGURATION" | "READINESS" | "FISCAL_RESOLUTION" | "DYNAMIC_RULES" | RestrictedDpsPreparationStage | "PAYLOAD_ASSERTION";

/**
 * Builds an exact environment-specific payload in memory. This endpoint is
 * intentionally isolated from invoice creation, DPS sequence reservation and
 * NationalNFSeProvider.issue(), so it cannot transmit or change state.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let stage: PreflightStage = "AUTH";
  let canViewXsdDiagnostics = false;
  try {
    const session = await requireOfficeSession();
    if (!can(session.role, "invoice:issue")) return NextResponse.json({ error: "Acesso do escritório necessário." }, { status: 403 });
    canViewXsdDiagnostics = session.role === "SUPER_ADMIN";

    const { id: organizationId } = await params;
    if (!organizationIdSchema.safeParse(organizationId).success) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    const operation = operationSchema.safeParse(await request.json());
    if (!operation.success) return NextResponse.json({ error: "Revise os dados da operação de teste." }, { status: 400 });

    stage = "LOAD_CONFIGURATION";
    const db = createAdminClient();
    const [organizationResult, profileResult, serviceResult, certificateResult, clientAccessResult] = await Promise.all([
      db.from("organizations").select("id,legal_name,tax_id,municipal_registration,municipality_code,postal_code,street,address_number,address_complement,neighborhood,state,email,phone").eq("id", organizationId).maybeSingle(),
      db.from("tax_profiles").select("tax_regime,dps_configuration,reviewed_at,reviewed_by").eq("organization_id", organizationId).maybeSingle(),
      db.from("service_templates").select("id,name,active,workflow_status,national_service_code_id,national_tax_code,municipal_service_code,municipal_service_mapping_id,dps_municipal_tax_code,dps_municipal_tax_code_source,service_location_municipality_code,nbs_code,iss_taxation,iss_rate_source,fiscal_reference,reviewed_at,reviewed_by").eq("organization_id", organizationId).eq("id", operation.data.serviceTemplateId).maybeSingle(),
      db.from("digital_certificates").select("status,owner_tax_id,valid_until").eq("organization_id", organizationId).is("replaced_at", null).maybeSingle(),
      createClientAccessService(db).getSummary(organizationId),
    ]);
    const organization = organizationResult.data;
    const profile = profileResult.data;
    const service = serviceResult.data;
    if (!organization || !profile || !service) return NextResponse.json({ error: "A empresa não possui a configuração necessária para esta pré-validação." }, { status: 422 });

    stage = "READINESS";
    const fiscalReadiness = getFiscalConfigurationReadiness(profile);
    const serviceReadiness = getServiceReadiness(service);
    if (!serviceReadiness.ready) return NextResponse.json({ error: "O serviço selecionado não está pronto para emissão." }, { status: 422 });
    const certificateReadiness = getCertificateReadiness({ certificate: certificateResult.data, organizationTaxId: organization.tax_id });
    const organizationReadiness = getOrganizationReadiness({
      registration: { municipalRegistration: organization.municipal_registration, street: organization.street, addressNumber: organization.address_number, neighborhood: organization.neighborhood, state: organization.state },
      fiscal: { ready: fiscalReadiness.status === "REVIEWED", message: "" },
      services: { ready: serviceReadiness.ready, message: "" },
      certificate: { ready: certificateReadiness.ready, message: "" },
      clientAccess: clientAccessResult.readiness,
    });
    if (!organizationReadiness.overallReady || !fiscalReadiness.technical) {
      return NextResponse.json({ error: "A prontidão da empresa precisa estar completa antes da pré-validação.", readiness: readinessResponse(organizationReadiness) }, { status: 422 });
    }

    stage = "FISCAL_RESOLUTION";
    const fiscal = await resolveFiscalConfiguration({
      organizationId,
      municipalityCode: organization.municipality_code,
      nationalTaxCode: service.national_tax_code,
      municipalServiceCode: service.municipal_service_code,
      dpsMunicipalTaxCode: service.dps_municipal_tax_code,
      nbsCode: service.nbs_code,
      issTaxation: service.iss_taxation,
      issRateSource: service.iss_rate_source,
      fiscalReference: service.fiscal_reference,
      taxRegime: profile.tax_regime as "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL",
      reviewedAt: profile.reviewed_at,
      serviceDate: operation.data.competence,
      dpsConfiguration: profile.dps_configuration,
    });
    stage = "DYNAMIC_RULES";
    if (!service.municipal_service_code) return NextResponse.json({ error: "O código municipal do serviço precisa ser revisado antes da pré-validação." }, { status: 422 });
    const municipalParameters = new MunicipalParametersProvider(
      new MtlsHttpClient(new OrganizationCertificateProvider()),
      municipalParametersEndpoints[operation.data.targetEnvironment],
      organizationId,
    );
    const [convention, retentions, aliquota, aliquotaHistory] = await Promise.all([
      municipalParameters.getConvention(organization.municipality_code),
      municipalParameters.getRetentions({ municipalityCode: organization.municipality_code, competence: operation.data.competence }),
      municipalParameters.getAliquota({ municipalityCode: organization.municipality_code, serviceCode: service.municipal_service_code, competence: operation.data.competence }),
      municipalParameters.getAliquotaHistory({ municipalityCode: organization.municipality_code, serviceCode: service.municipal_service_code }),
    ]);
    const applicableRates = aliquota.aliquotas[service.municipal_service_code] ?? [];
    if (!applicableRates.length) throw new Error("MUNICIPAL_PARAMETERS_INVALID");
    const retentionMatches = (retentions.retencoes.retencoesMunicipais ?? []).flatMap((retention) =>
      (retention.servicos ?? [])
        .filter((serviceItem) => serviceItem.codigoCompleto === service.municipal_service_code)
        .map(() => ({ validFrom: retention.dataInicioVigencia, validUntil: retention.dataFimVigencia, types: retention.tiposRetencao ?? [] })),
    );
    stage = "BUILD_DOCUMENT";
    const document = buildFiscalDocument({
      organization: { id: organization.id, taxId: organization.tax_id, municipalRegistration: organization.municipal_registration ?? "", municipalityCode: organization.municipality_code },
      customer: { taxId: operation.data.customer.taxId, legalName: operation.data.customer.legalName },
      service: { nationalTaxCode: service.national_tax_code, municipalServiceCode: service.dps_municipal_tax_code },
      taxConfiguration: { regime: profile.tax_regime as "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL", taxationType: "MUNICIPAL", iss: { withheld: false, source: "ACCEPTED_PRODUCTION_DPS" }, ibsCbs: { customerFieldsEnabled: false } },
      amountCents: operation.data.amountCents,
      serviceDate: operation.data.competence,
      description: operation.data.description,
      dpsNumber: DRY_RUN_NUMBER,
      dpsSeries: DRY_RUN_SERIES,
    });
    stage = "PREPARE_DPS";
    const prepared = await prepareRestrictedDps({
      organizationId,
      environment: operation.data.targetEnvironment,
      document,
      organization: {
        legalName: organization.legal_name,
        taxId: organization.tax_id,
        municipalRegistration: organization.municipal_registration ?? "",
        municipalityCode: organization.municipality_code,
        postalCode: organization.postal_code ?? "",
        street: organization.street ?? "",
        addressNumber: organization.address_number ?? "",
        addressComplement: organization.address_complement,
        neighborhood: organization.neighborhood ?? "",
        state: organization.state ?? "",
        email: organization.email,
        phone: organization.phone,
      },
      customer: { personType: "LEGAL_ENTITY", ...operation.data.customer, countryCode: "BR" },
      service: { nationalTaxCode: service.national_tax_code, dpsMunicipalTaxCode: service.dps_municipal_tax_code ?? "", nbsCode: service.nbs_code, locationMunicipalityCode: service.service_location_municipality_code ?? "" },
      fiscal: {
        regime: fiscal.dpsConfiguration.regime,
        iss: {
          taxation: fiscal.iss.taxation,
          withholding: fiscal.iss.withholdingType,
          rateSource: fiscal.iss.rateSource,
          ...(fiscal.iss.rateBasisPoints === undefined ? {} : { rateBasisPoints: fiscal.iss.rateBasisPoints }),
        },
        totalTaxes: fiscal.dpsConfiguration.totalTaxes,
      },
      issuerMunicipalRegistrationEmission: fiscal.issuerMunicipalRegistrationEmission,
      onStage: (nextStage) => { stage = nextStage; },
    });
    stage = "PAYLOAD_ASSERTION";
    const signedXml = decodeDpsFromSefin(prepared.preparedPayload.dpsXmlGZipB64);
    const pAliqEmitted = signedXml.includes("<pAliq>");
    const prestXml = signedXml.match(/<prest>([\s\S]*?)<\/prest>/)?.[1] ?? "";
    const issuerMunicipalRegistrationCompliant = fiscal.issuerMunicipalRegistrationEmission === "OMIT" ? !prestXml.includes("<IM>") : true;
    const totalTaxesCompliant = fiscal.dpsConfiguration.regime.simpleNational === "3"
      ? !signedXml.includes("<indTotTrib>") && (signedXml.includes("<pTotTrib>") || signedXml.includes("<pTotTribSN>"))
      : true;
    const businessRulesPassed = issuerMunicipalRegistrationCompliant && !prestXml.includes("<xNome>") && !prestXml.includes("<end>") && totalTaxesCompliant;
    // These check that the signed DPS actually reflects the service/operation
    // requested — not that it matches one specific homologated scenario, so
    // this validates whichever ready service the office selects.
    if (
      !businessRulesPassed
      || prepared.model.service.nationalTaxCode !== service.national_tax_code
      || prepared.model.service.nbsCode !== service.nbs_code
      || prepared.model.amountCents !== operation.data.amountCents
      || prepared.model.competence !== operation.data.competence
    ) {
      return NextResponse.json({ error: "A DPS de teste não corresponde ao cenário homologado." }, { status: 422 });
    }

    const sequence = operation.data.targetEnvironment === "PRODUCTION"
      ? await db.from("dps_sequences").select("series,next_number").eq("organization_id", organizationId).eq("environment", "PRODUCTION").eq("series", "00001").maybeSingle()
      : null;
    if (sequence?.error) throw new Error("PRODUCTION_SEQUENCE_LOOKUP_FAILED");

    return NextResponse.json({
      readiness: readinessResponse(organizationReadiness),
      validation: { dpsBuilt: true, dynamicRules: true, unsignedXsd: true, xmldsig: true, signatureVerification: true, signedXsd: true, gzipBase64: true, payload: true, businessRules: true, pAliqEmitted },
      municipalParameters: {
        lookupCode: service.municipal_service_code,
        conventionAvailable: Boolean(convention),
        aliquota: applicableRates.map((rate) => ({ incidence: rate.Incidencia, rate: rate.Aliq, validFrom: rate.DtIni, validUntil: rate.DtFim })),
        aliquotaHistoryAvailable: Boolean(aliquotaHistory.aliquotas[service.municipal_service_code]?.length),
        retentions: { articleSixthEnabled: retentions.retencoes.artigoSexto.habilitado, matchingRules: retentionMatches },
      },
      target: {
        environment: operation.data.targetEnvironment,
        endpoint: `${endpoints[operation.data.targetEnvironment]}/nfse`,
        method: "POST",
        contentType: "application/json",
        provider: "NATIONAL",
        ...(operation.data.targetEnvironment === "PRODUCTION" ? {
          productionSequence: sequence?.data
            ? { exists: true, series: sequence.data.series, nextNumber: Number(sequence.data.next_number) }
            : { exists: false, series: "00001", nextNumber: 1, provisionedOnFirstAuthorizedReservation: true },
        } : {}),
      },
      transmissionAttempted: false,
      sequenceConsumed: false,
      invoiceCreated: false,
    });
  } catch (error) {
    const upstreamCode = getSafeErrorCode(error);
    const errorName = error instanceof Error && /^[A-Za-z0-9_]{1,80}$/.test(error.name) ? error.name : "UnknownError";
    const code = `${stage}:${upstreamCode}`;
    const xsdDiagnostic = isUnsignedXsdStage(stage) ? getSafeXsdDiagnostic(error) : undefined;
    console.error("EMISSION_PREFLIGHT_FAILED", {
      stage,
      upstreamCode,
      errorName,
      ...(xsdDiagnostic ? { xsdErrorCount: xsdDiagnostic.errorCount, xsdErrors: xsdDiagnostic.errors } : {}),
    });
    return NextResponse.json({
      error: "A pré-validação da emissão não foi concluída.",
      code,
      ...(canViewXsdDiagnostics && xsdDiagnostic ? { xsdDiagnostic } : {}),
    }, { status: 422 });
  }
}

function getSafeErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)) return error.code;
  return "EMISSION_PREFLIGHT_FAILED";
}

function isUnsignedXsdStage(stage: PreflightStage) {
  return stage === "UNSIGNED_XSD";
}

function getSafeXsdDiagnostic(error: unknown) {
  if (!error || typeof error !== "object" || !("xsdDiagnostic" in error) || !error.xsdDiagnostic || typeof error.xsdDiagnostic !== "object") return undefined;
  const source = error.xsdDiagnostic as { errorCount?: unknown; errors?: unknown };
  if (typeof source.errorCount !== "number" || !Array.isArray(source.errors)) return undefined;
  const errors = source.errors
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.replace(/(?:[A-Za-z]:)?[\\/][^\s'\"]+/g, "[path]").replace(/https?:\/\/[^\s'\"]+/g, "[url]").slice(0, 400))
    .slice(0, 5);
  return { errorCount: source.errorCount, errors };
}

function readinessResponse(readiness: ReturnType<typeof getOrganizationReadiness>) {
  return {
    registration: readiness.items.find((item) => item.key === "registration")?.ready ?? false,
    fiscal: readiness.items.find((item) => item.key === "fiscal")?.ready ?? false,
    service: readiness.items.find((item) => item.key === "services")?.ready ?? false,
    certificate: readiness.items.find((item) => item.key === "certificate")?.ready ?? false,
    clientAccess: readiness.items.find((item) => item.key === "clientAccess")?.ready ?? false,
    organization: readiness.overallReady,
  };
}
