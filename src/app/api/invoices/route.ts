import { NextResponse } from "next/server";
import { z } from "zod";
import { buildFiscalDocument } from "@/lib/nfse/issuance/domain";
import { getNFSeProvider } from "@/lib/nfse/issuance/provider";
import { parseMoneyToCents } from "@/lib/validation/money";
import { assertRateLimit } from "@/lib/security/rate-limit";
import { logEvent } from "@/lib/observability/logger";
import { requireIssuanceContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveFiscalConfiguration } from "@/lib/nfse/fiscal-rule-resolver";
import { SafeFiscalError } from "@/lib/nfse/errors";
import { getServiceReadiness } from "@/lib/nfse/service-readiness";
import { getFiscalConfigurationReadiness,isFiscalProfileAccepted } from "@/lib/nfse/fiscal-configuration";
import { isAdnAutomaticService } from "@/lib/services/automatic-service";
import { getCertificateReadiness } from "@/lib/nfse/certificate/status";
import { getOrganizationReadiness } from "@/lib/organizations/readiness";
import { assertNationalEmissionReady } from "@/lib/nfse/issuance/restricted-readiness";
import { prepareRestrictedDps } from "@/lib/nfse/issuance/prepare-restricted-dps";
import { createSupabaseInvoiceSubmissionGateway,submitInvoiceSafely } from "@/lib/nfse/issuance/submission-service";
import { decideIdempotencyReplay,UNKNOWN_CLIENT_MESSAGE } from "@/lib/nfse/issuance/state-machine";
import { reconcileUnknownInvoice } from "@/lib/nfse/reconciliation/service";
import { reserveDpsNumber } from "@/lib/nfse/issuance/dps-reservation";
import { issuanceFailureDiagnostic, type IssuanceStage } from "@/lib/nfse/issuance/request-diagnostics";
import { getConfiguredNFSeEnvironment } from "@/lib/nfse/environments";
import { persistOfficialArtifact } from "@/lib/nfse/artifacts/persistence";
import { SefinRestrictedReconciliationClient } from "@/lib/nfse/reconciliation/client";
import type { NFSeEnvironment } from "@/lib/nfse/types";
import { assertEventTransmissionEnabled } from "@/lib/nfse/events/cancellation";
import { ibsCbsObrigatorio } from "@/lib/nfse/ibs-cbs";

/** Best-effort: the invoice is already validly issued regardless of whether this succeeds. */
async function persistIssuedArtifactsBestEffort(input:{invoiceId:string;organizationId:string;environment:NFSeEnvironment;accessKey:string;officialXml:string}){
  try{
    await persistOfficialArtifact({invoiceId:input.invoiceId,organizationId:input.organizationId,artifactType:"NFSE_XML",content:Buffer.from(input.officialXml,"utf8"),contentType:"application/xml"});
  }catch{ /* the official document remains retrievable later from SEFIN by access key */ }
  if(process.env.NFSE_PROVIDER!=="national")return;
  try{
    const client=new SefinRestrictedReconciliationClient(undefined,input.environment);
    const danfse=await client.getDanfseByAccessKey({organizationId:input.organizationId,accessKey:input.accessKey});
    if(danfse)await persistOfficialArtifact({invoiceId:input.invoiceId,organizationId:input.organizationId,artifactType:"DANFSE_PDF",content:danfse.pdf,contentType:"application/pdf"});
  }catch{ /* SEFIN may still be generating the DANFSe; a later retry can recover it */ }
}

/** A SEFIN registra o cancelamento por substituição (e105102) na original ao autorizar a substituta. */
async function markSubstitutedBestEffort(input:{organizationId:string;originalId:string}){
  const now=new Date().toISOString();
  try{await createAdminClient().from("invoices").update({status:"CANCELLED",cancelled_at:now,updated_at:now}).eq("id",input.originalId).eq("organization_id",input.organizationId).eq("status","ISSUED");}catch{ /* a tela da original também deduz pela substituta autorizada */ }
}

/** Extras gravados com a nota → entradas da DPS (o intermediário vira pessoa da DPS). */
function dpsExtras(extras:Input["extras"]){
  if(!extras)return {};
  const{intermediary,...rest}=extras;
  return{...rest,...(intermediary?{intermediary:{taxId:intermediary.taxId,name:intermediary.name,...(intermediary.email?{email:intermediary.email}:{}),...(intermediary.phone?{phone:intermediary.phone}:{})}}:{})};
}

export const runtime="nodejs";
export const dynamic="force-dynamic";

const cents=z.number().int().min(1).max(99_999_999_999);
const basisPoints=z.number().int().min(0).max(10000);
/** Grupos opcionais da DPS preenchidos no Portal Contribuinte (mesmos nomes do modelo da DPS). */
const extrasSchema=z.object({
  intermediary:z.object({taxId:z.string().regex(/^(\d{11}|\d{14})$/),name:z.string().trim().min(2).max(300),email:z.email().max(80).optional(),phone:z.string().regex(/^\d{6,20}$/).optional()}).optional(),
  complement:z.object({technicalDocument:z.string().trim().min(1).max(40).optional(),referenceDocument:z.string().trim().min(1).max(255).optional(),purchaseOrder:z.string().trim().min(1).max(60).optional(),text:z.string().trim().min(1).max(2000).optional()}).optional(),
  foreignTrade:z.object({mode:z.enum(["1","2","3","4"]),relationship:z.enum(["0","1","2","3","4","5","6"]),currencyCode:z.string().regex(/^\d{3}$/),amountInCurrencyCents:cents,providerSupport:z.string().regex(/^0[1-8]$/),customerSupport:z.string().regex(/^(0[1-9]|1[0-9])$/),temporaryGoods:z.enum(["1","2","3"]),importDeclaration:z.string().trim().min(1).max(12).optional(),exportRegistration:z.string().trim().min(1).max(12).optional(),shareWithMdic:z.enum(["0","1"])}).optional(),
  values:z.object({unconditionalDiscountCents:cents.optional(),conditionalDiscountCents:cents.optional()}).optional(),
  federal:z.object({pisCofins:z.object({cst:z.string().regex(/^\d{2}$/),baseCents:z.number().int().min(0).max(99_999_999_999).optional(),pisBasisPoints:basisPoints.optional(),cofinsBasisPoints:basisPoints.optional(),pisCents:z.number().int().min(0).optional(),cofinsCents:z.number().int().min(0).optional(),retention:z.string().regex(/^\d$/).optional()}).optional(),socialSecurityCents:cents.optional(),irrfCents:cents.optional(),csllCents:cents.optional()}).optional(),
});
const schema=z.object({organizationId:z.uuid().optional(),serviceTemplateId:z.uuid(),customerId:z.uuid().optional(),amount:z.union([z.string(),z.number()]),serviceDate:z.iso.date(),description:z.string().trim().min(3).max(1000),productionConfirmation:z.boolean().optional(),scenario:z.enum(["success","rejection","timeout"]).optional(),manualIssRateBasisPoints:z.number().int().min(0).max(10000).optional(),manualIssRateSourceNote:z.string().trim().min(3).max(500).optional(),substitution:z.object({invoiceId:z.uuid(),reasonCode:z.enum(["01","02","03","04","05","99"]),reason:z.string().trim().min(15).max(255).optional()}).optional(),ibsCbs:z.object({finalConsumer:z.enum(["0","1"]),operationIndicator:z.string().regex(/^\d{6}$/),destinationIndicator:z.literal("0"),cst:z.string().regex(/^\d{3}$/),classification:z.string().regex(/^\d{6}$/)}).optional(),extras:extrasSchema.optional()});
const idempotencySchema=z.uuid();
type Input=z.infer<typeof schema>;

function responseForStored(invoice:{id:string;status:string;access_key?:string|null;nfse_number?:string|null;safe_status_message?:string|null},requestId:string){
  const status=invoice.status==="UNKNOWN"||invoice.status==="SUBMITTING"?202:invoice.status==="REJECTED"?422:200;
  const publicStatus=invoice.status==="SUBMITTING"?"UNKNOWN":invoice.status;
  return NextResponse.json({invoiceId:invoice.id,status:publicStatus,accessKey:invoice.access_key,nfseNumber:invoice.nfse_number,safeMessage:invoice.status==="UNKNOWN"||invoice.status==="SUBMITTING"?UNKNOWN_CLIENT_MESSAGE:invoice.safe_status_message},{status,headers:{"X-Idempotent-Replay":"true","X-Request-ID":requestId}});
}

/**
 * Emissão barrada antes de virar nota (cadastro, serviço, certificado, erro interno): sem isso ela só existia na tela
 * de quem tentou. Fica no histórico para o painel "Não emitidas" do escritório. Melhor esforço: nunca muda a resposta.
 */
async function recordBlockedEmission(context:{organizationId:string;actorUserId:string|null;actorType:string;customerId?:string|undefined;serviceTemplateId?:string|undefined;amountCents?:number|null},requestId:string,stage:IssuanceStage,code:string,message:string){
  try{
    await createAdminClient().from("audit_logs").insert({organization_id:context.organizationId,actor_user_id:context.actorUserId,actor_type:context.actorType,action:"invoice_blocked",entity:"invoice_request",entity_id:null,request_id:/^[0-9a-f-]{36}$/i.test(requestId)?requestId:null,safe_metadata:{code,message:message.slice(0,300),stage,customerId:context.customerId??null,serviceTemplateId:context.serviceTemplateId??null,amountCents:context.amountCents??null}});
  }catch{}
}

export async function POST(request:Request){
  const requestId=request.headers.get("x-request-id")??crypto.randomUUID();
  let stage: IssuanceStage="AUTH";
  const parsedKey=idempotencySchema.safeParse(request.headers.get("idempotency-key"));
  if(!parsedKey.success)return NextResponse.json({error:"Chave de idempotência ausente ou inválida."},{status:400});
  const idempotencyKey=parsedKey.data;
  let blockedContext:Parameters<typeof recordBlockedEmission>[0]|null=null;
  try{
    assertRateLimit(`issue:${request.headers.get("x-forwarded-for")??"local"}`);
    const requested=schema.parse(await request.json());
    if (getConfiguredNFSeEnvironment() === "PRODUCTION" && requested.productionConfirmation !== true) {
      throw new SafeFiscalError("PRODUCTION_CONFIRMATION_REQUIRED", "Confirme explicitamente a emissão em Produção antes de transmitir.");
    }
    if(process.env.NFSE_PROVIDER!=="national"&&!process.env.NEXT_PUBLIC_SUPABASE_URL){
      const document=buildFiscalDocument({organization:{id:"local-mock",taxId:"00000000000000",municipalRegistration:"ISENTO",municipalityCode:"0000000"},customer:{legalName:"Tomador de demonstração"},service:{nationalTaxCode:"000000"},taxConfiguration:{regime:"SIMPLES_NACIONAL",taxationType:"MUNICIPAL",iss:{withheld:false,source:"OFFICE_PARAMETER"},ibsCbs:{customerFieldsEnabled:false}},amountCents:parseMoneyToCents(requested.amount),serviceDate:requested.serviceDate,description:requested.description,dpsNumber:1n,dpsSeries:"00001"});
      const result=await getNFSeProvider().issue({document,idempotencyKey,scenario:requested.scenario});
      return NextResponse.json({status:result.status,invoiceId:result.status==="ISSUED"?result.nfseNumber:undefined,safeMessage:result.status==="UNKNOWN"?UNKNOWN_CLIENT_MESSAGE:result.status==="REJECTED"?result.safeMessage:"Nota emitida com sucesso."},{status:result.status==="UNKNOWN"?202:result.status==="REJECTED"?422:201,headers:{"X-Request-ID":requestId}});
    }

    stage="AUTH";
    const session=await requireIssuanceContext(requested.organizationId);
    blockedContext={organizationId:session.organizationId,actorUserId:session.actorUserId??null,actorType:session.actorType,customerId:requested.customerId,serviceTemplateId:requested.serviceTemplateId,amountCents:(()=>{try{return Number(parseMoneyToCents(requested.amount))}catch{return null}})()};
    const authenticatedClient=await createClient();
    if(!authenticatedClient)throw new SafeFiscalError("AUTH_CONFIGURATION_REQUIRED","A sessão de emissão não está disponível.");
    const admin=createAdminClient();
    stage="LOAD_DATA";
    let{data:existing}=await admin.from("invoices").select("id,status,access_key,nfse_number,safe_status_message,customer_id,service_template_id,amount_cents,service_date,description,dps_series,dps_number,dps_identifier,substitutes_invoice_id,substitution_reason_code,substitution_reason,ibs_cbs,dps_extras").eq("organization_id",session.organizationId).eq("idempotency_key",idempotencyKey).maybeSingle();
    if(existing&&existing.status==="UNKNOWN"){
      try{await reconcileUnknownInvoice({invoiceId:existing.id,organizationId:session.organizationId});}catch{}
      const refreshed=await admin.from("invoices").select("id,status,access_key,nfse_number,safe_status_message,customer_id,service_template_id,amount_cents,service_date,description,dps_series,dps_number,dps_identifier,substitutes_invoice_id,substitution_reason_code,substitution_reason,ibs_cbs,dps_extras").eq("id",existing.id).single();
      existing=refreshed.data??existing;
    }
    if(existing&&decideIdempotencyReplay(existing.status)!=="CLAIM")return responseForStored(existing,requestId);

    const effective:Input=existing?{...requested,customerId:existing.customer_id??undefined,serviceTemplateId:existing.service_template_id,amount:Number(existing.amount_cents)/100,serviceDate:existing.service_date,description:existing.description,substitution:existing.substitutes_invoice_id?{invoiceId:existing.substitutes_invoice_id,reasonCode:existing.substitution_reason_code as NonNullable<Input["substitution"]>["reasonCode"],...(existing.substitution_reason?{reason:existing.substitution_reason}:{})}:undefined,ibsCbs:(existing.ibs_cbs as Input["ibsCbs"])??undefined,extras:(existing.dps_extras as Input["extras"])??undefined}:requested;
    const[{data:organization},{data:customer},{data:service},{data:profile},{data:certificate},{data:clientAccess}]=await Promise.all([
      admin.from("organizations").select("id,legal_name,tax_id,municipal_registration,municipality_code,status,emission_blocked,require_office_review,postal_code,street,address_number,address_complement,neighborhood,state,email,phone").eq("id",session.organizationId).single(),
      // Sem customerId = Tomador/Adquirente não informado (a DPS sai sem o grupo toma).
      effective.customerId?admin.from("customers").select("id,person_type,tax_id,legal_name,email,phone,postal_code,street,address_number,address_complement,neighborhood,municipal_registration,municipality_code,state,country_code,foreign_tax_id,no_foreign_tax_id_reason,city,foreign_postal_code").eq("id",effective.customerId).eq("organization_id",session.organizationId).maybeSingle():Promise.resolve({data:null}),
      admin.from("service_templates").select("id,national_tax_code,municipal_service_code,municipal_service_mapping_id,national_service_code_id,dps_municipal_tax_code,dps_municipal_tax_code_source,service_location_municipality_code,nbs_code,iss_taxation,iss_rate_source,fiscal_reference,workflow_status,auto_ready_source,reviewed_at,reviewed_by,active").eq("id",effective.serviceTemplateId).eq("organization_id",session.organizationId).in("workflow_status",["REVIEWED","AUTO_READY"]).eq("active",true).single(),
      admin.from("tax_profiles").select("tax_regime,reviewed_at,reviewed_by,iss_configuration,dps_configuration,origin").eq("organization_id",session.organizationId).single(),
      admin.from("digital_certificates").select("status,owner_tax_id,valid_until").eq("organization_id",session.organizationId).is("replaced_at",null).maybeSingle(),
      admin.from("client_accesses").select("enabled").eq("organization_id",session.organizationId).eq("enabled",true).maybeSingle(),
    ]);
    if(!organization)throw new SafeFiscalError("FISCAL_CONFIGURATION_INCOMPLETE","Empresa não encontrada.");
    if(effective.customerId&&!customer)throw new SafeFiscalError("FISCAL_CONFIGURATION_INCOMPLETE","O tomador escolhido não está mais cadastrado nesta empresa. Volte ao passo Pessoas e escolha o tomador de novo.");
    if(!service)throw new SafeFiscalError("FISCAL_CONFIGURATION_INCOMPLETE","O serviço escolhido não está pronto para emissão. Volte ao passo Serviço e escolha o código de novo.");
    if(!profile)throw new SafeFiscalError("FISCAL_CONFIGURATION_INCOMPLETE","A configuração fiscal da empresa ainda não existe. O escritório cadastra em Empresa → Configuração fiscal.");
    // Tomador no exterior: a SEFIN exige o grupo de comércio exterior (E0330).
    if(customer?.person_type==="FOREIGN"&&!effective.extras?.foreignTrade)throw new SafeFiscalError("FISCAL_CONFIGURATION_INCOMPLETE","Tomador no exterior: informe os dados de comércio exterior no passo Serviço.");
    stage="READINESS";
    // "Subiu o A1, está pronto": perfil automático e serviço automático do ADN valem, a não ser que a empresa exija revisão do escritório.
    const requireOfficeReview=Boolean(organization.require_office_review);
    const automaticService=isAdnAutomaticService(service);
    const baseServiceReadiness=getServiceReadiness(service);
    const serviceReadiness={...baseServiceReadiness,ready:baseServiceReadiness.ready&&!(automaticService&&requireOfficeReview)};
    const fiscalReadiness=getFiscalConfigurationReadiness(profile);
    const fiscalAccepted=isFiscalProfileAccepted(fiscalReadiness.status,requireOfficeReview);
    // O acesso do cliente ao portal só importa quando é ele quem emite; o escritório emite com o A1 da empresa.
    const clientAccessReady=session.actorType==="OFFICE"||Boolean(clientAccess?.enabled);
    const certificateReadiness=getCertificateReadiness({certificate,organizationTaxId:organization.tax_id});
    const organizationReadiness=getOrganizationReadiness({registration:{municipalRegistration:organization.municipal_registration,street:organization.street,addressNumber:organization.address_number,neighborhood:organization.neighborhood,state:organization.state},fiscal:{ready:fiscalAccepted,message:""},services:{ready:serviceReadiness.ready,message:""},certificate:{ready:certificateReadiness.ready,message:""},clientAccess:{ready:clientAccessReady,message:""}});
    const nationalEnvironment=process.env.NFSE_PROVIDER==="national"?assertNationalEmissionReady({registrationReady:organizationReadiness.items.find(x=>x.key==="registration")?.ready??false,fiscalReady:fiscalAccepted,serviceReady:serviceReadiness.ready,certificateReady:certificateReadiness.ready,clientAccessReady,organizationStatus:organization.status,emissionBlocked:organization.emission_blocked,environment:process.env.NFSE_ENV,provider:process.env.NFSE_PROVIDER,productionEnabled:process.env.ENABLE_NFSE_PRODUCTION,restrictedTransmissionEnabled:process.env.ENABLE_NFSE_RESTRICTED_TRANSMISSION}):undefined;
    const invoiceEnvironment=nationalEnvironment?.environment??"PRODUCTION_RESTRICTED";
    if(!effective.ibsCbs&&ibsCbsObrigatorio(invoiceEnvironment,effective.serviceDate))throw new SafeFiscalError("IBS_CBS_REQUIRED","Esta competência exige as informações de IBS/CBS. Informe-as no passo Serviço.");
    // Substituição: a original tem de ser uma NFS-e gerada desta empresa, no mesmo ambiente, sem outra substituta em andamento.
    let substituted:{id:string;accessKey:string}|null=null;
    if(effective.substitution){
      stage="LOAD_DATA";
      assertEventTransmissionEnabled(invoiceEnvironment,"SUBSTITUTION");
      const{data:original}=await admin.from("invoices").select("id,status,access_key,environment").eq("id",effective.substitution.invoiceId).eq("organization_id",session.organizationId).maybeSingle();
      if(!original||!original.access_key||original.environment!==invoiceEnvironment||(original.status!=="ISSUED"&&!(existing&&original.status==="CANCELLED")))throw new SafeFiscalError("SUBSTITUTION_INVALID","Só dá para substituir uma NFS-e gerada desta empresa.");
      const{data:outras}=await admin.from("invoices").select("id").eq("substitutes_invoice_id",original.id).in("status",["READY","SUBMITTING","UNKNOWN","ISSUED"]).neq("idempotency_key",idempotencyKey);
      if(outras?.length)throw new SafeFiscalError("SUBSTITUTION_INVALID","Esta NFS-e já tem uma substituta emitida ou em andamento.");
      substituted={id:original.id,accessKey:original.access_key};
    }

    stage="FISCAL_RESOLUTION";
    const fiscal=await resolveFiscalConfiguration({organizationId:session.organizationId,municipalityCode:organization.municipality_code,nationalTaxCode:service.national_tax_code,municipalServiceCode:service.municipal_service_code,dpsMunicipalTaxCode:service.dps_municipal_tax_code,nbsCode:service.nbs_code,issTaxation:service.iss_taxation,issRateSource:service.iss_rate_source,fiscalReference:service.fiscal_reference,taxRegime:profile.tax_regime,reviewedAt:profile.reviewed_at,automaticProfile:fiscalAccepted&&fiscalReadiness.status==="AUTOMATIC",automaticService:automaticService&&!requireOfficeReview,serviceDate:effective.serviceDate,dpsConfiguration:profile.dps_configuration,...(session.actorType==="OFFICE"&&requested.manualIssRateBasisPoints!==undefined&&requested.manualIssRateSourceNote?{manualRateBasisPoints:requested.manualIssRateBasisPoints,manualRateSourceNote:requested.manualIssRateSourceNote}:{})});
    let invoice=existing;
    let dpsNumber=existing?.dps_number;
    if(!invoice){stage="RESERVE_DPS";dpsNumber=await reserveDpsNumber(authenticatedClient,{organizationId:session.organizationId,series:"00001",environment:invoiceEnvironment});}
    stage="BUILD_DOCUMENT";
    const document=buildFiscalDocument({organization:{id:organization.id,taxId:organization.tax_id,municipalRegistration:organization.municipal_registration??"",municipalityCode:organization.municipality_code},customer:customer?{taxId:customer.tax_id,legalName:customer.legal_name}:{legalName:"Tomador não informado"},service:{nationalTaxCode:service.national_tax_code,municipalServiceCode:fiscal.municipalServiceCode},taxConfiguration:{regime:profile.tax_regime,taxationType:"MUNICIPAL",iss:{rateBasisPoints:fiscal.iss.rateBasisPoints,withheld:fiscal.iss.withholdingType!=="1",source:fiscal.iss.source},ibsCbs:{customerFieldsEnabled:false}},amountCents:parseMoneyToCents(effective.amount),serviceDate:effective.serviceDate,description:effective.description,dpsNumber:BigInt(dpsNumber),dpsSeries:existing?.dps_series??"00001"});
    if(!invoice){
      stage="INVOICE_INSERT";
      const inserted=await admin.from("invoices").insert({organization_id:session.organizationId,customer_id:customer?.id??null,service_template_id:service.id,amount_cents:document.amountCents,service_date:effective.serviceDate,description:effective.description,status:"READY",idempotency_key:idempotencyKey,dps_series:"00001",dps_number:dpsNumber,dps_identifier:document.dps.identifier,environment:invoiceEnvironment,created_by:session.actorUserId,ibs_cbs:effective.ibsCbs??null,dps_extras:effective.extras??null,...(substituted&&effective.substitution?{substitutes_invoice_id:substituted.id,substitution_reason_code:effective.substitution.reasonCode,substitution_reason:effective.substitution.reason??null}:{})}).select("id,status,dps_identifier").single();
      if(inserted.error||!inserted.data){
        if(inserted.error)logEvent("error","INVOICE_INSERT_FAILED",{requestId,...issuanceFailureDiagnostic(stage,inserted.error)});
        const replay=await admin.from("invoices").select("id,status,access_key,nfse_number,safe_status_message").eq("organization_id",session.organizationId).eq("idempotency_key",idempotencyKey).maybeSingle();if(replay.data)return responseForStored(replay.data,requestId);throw new Error("INVOICE_PERSIST_FAILED");
      }
      invoice=inserted.data as typeof existing;
    }
    if(!invoice)throw new Error("INVOICE_PERSIST_FAILED");
    stage="AUDIT_INSERT";
    const audit=await admin.from("audit_logs").insert({organization_id:session.organizationId,actor_user_id:session.actorUserId,actor_type:session.actorType,action:"invoice_requested",entity:"invoice",entity_id:invoice.id,request_id:requestId,safe_metadata:{issSource:fiscal.iss.source,...(fiscal.manualRateSourceNote?{manualIssRateBasisPoints:fiscal.iss.rateBasisPoints,manualIssRateSourceNote:fiscal.manualRateSourceNote}:{})}});
    if(audit.error)throw new Error("INVOICE_AUDIT_FAILED");
    const attemptRequestId=crypto.randomUUID();
    logEvent("info","INVOICE_REQUESTED",{requestId,organizationId:session.organizationId,idempotencyKey});
    stage="CLAIM_SUBMISSION";
    const submission=await submitInvoiceSafely({gateway:createSupabaseInvoiceSubmissionGateway(invoiceEnvironment),invoiceId:invoice.id,organizationId:session.organizationId,requestId:attemptRequestId,dpsIdentifier:document.dps.identifier,execute:async()=>{
      if(process.env.NFSE_PROVIDER!=="national")return getNFSeProvider().issue({document,idempotencyKey,scenario:effective.scenario});
      const fiscalForDps={regime:fiscal.dpsConfiguration.regime,iss:{taxation:fiscal.iss.taxation,withholding:fiscal.iss.withholdingType,rateSource:fiscal.iss.rateSource,...(fiscal.iss.rateBasisPoints!==undefined?{rateBasisPoints:fiscal.iss.rateBasisPoints}:{}),...(fiscal.dpsConfiguration.iss.benefitNumber?{benefit:{number:fiscal.dpsConfiguration.iss.benefitNumber}}:{})},totalTaxes:fiscal.dpsConfiguration.totalTaxes};
      stage="PREPARE_DPS";
      const prepared=await prepareRestrictedDps({organizationId:session.organizationId,environment:invoiceEnvironment,document,organization:{legalName:organization.legal_name,taxId:organization.tax_id,municipalRegistration:organization.municipal_registration??"",municipalityCode:organization.municipality_code,postalCode:organization.postal_code??"",street:organization.street??"",addressNumber:organization.address_number??"",addressComplement:organization.address_complement,neighborhood:organization.neighborhood??"",state:organization.state??"",email:organization.email,phone:organization.phone},customer:customer?{personType:customer.person_type,taxId:customer.tax_id,legalName:customer.legal_name,municipalRegistration:customer.municipal_registration,postalCode:customer.postal_code,street:customer.street,addressNumber:customer.address_number,addressComplement:customer.address_complement,neighborhood:customer.neighborhood,municipalityCode:customer.municipality_code,state:customer.state,countryCode:customer.country_code,email:customer.email,phone:customer.phone,foreignTaxId:customer.foreign_tax_id,noForeignTaxIdReason:customer.no_foreign_tax_id_reason,city:customer.city,foreignPostalCode:customer.foreign_postal_code}:undefined,service:{nationalTaxCode:service.national_tax_code,dpsMunicipalTaxCode:service.dps_municipal_tax_code??"",nbsCode:service.nbs_code,locationMunicipalityCode:service.service_location_municipality_code??""},fiscal:fiscalForDps,issuerMunicipalRegistrationEmission:fiscal.issuerMunicipalRegistrationEmission,...(effective.ibsCbs?{ibsCbs:effective.ibsCbs}:{}),...dpsExtras(effective.extras),...(substituted&&effective.substitution?{substitution:{accessKey:substituted.accessKey,reasonCode:effective.substitution.reasonCode,...(effective.substitution.reason?{reason:effective.substitution.reason}:{})}}:{})});
      stage="PROVIDER_CALL";
      return getNFSeProvider().issue({document,idempotencyKey,organizationId:session.organizationId,preparedPayload:prepared.preparedPayload});
    }});
    if(submission.kind==="REPLAY")return responseForStored({id:invoice.id,status:submission.status},requestId);
    const result=submission.result;
    if(result.status==="REJECTED")return NextResponse.json({invoiceId:invoice.id,status:result.status,safeMessage:result.safeMessage},{status:422,headers:{"X-Request-ID":requestId}});
    if(result.status==="ISSUED"&&substituted)await markSubstitutedBestEffort({organizationId:session.organizationId,originalId:substituted.id});
    if(result.status==="ISSUED")await persistIssuedArtifactsBestEffort({invoiceId:invoice.id,organizationId:session.organizationId,environment:invoiceEnvironment,accessKey:result.accessKey,officialXml:result.officialXml});
    return NextResponse.json({status:result.status,invoiceId:invoice.id,...(result.status==="ISSUED"?{accessKey:result.accessKey,nfseNumber:result.nfseNumber}:{}),safeMessage:result.status==="UNKNOWN"?UNKNOWN_CLIENT_MESSAGE:"Nota emitida com sucesso."},{status:result.status==="UNKNOWN"?202:201,headers:{"X-Request-ID":requestId}});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Revise os dados informados.",fields:error.flatten().fieldErrors},{status:400,headers:{"X-Request-ID":requestId}});
    if(error instanceof Error&&error.message==="RATE_LIMITED")return NextResponse.json({error:"Muitas tentativas. Aguarde um minuto e tente novamente."},{status:429,headers:{"X-Request-ID":requestId}});
    if(error instanceof SafeFiscalError){
      if(blockedContext)await recordBlockedEmission(blockedContext,requestId,stage,error.code,error.safeMessage);
      return NextResponse.json({error:error.safeMessage,code:error.code},{status:422,headers:{"X-Request-ID":requestId}});
    }
    logEvent("error","INVOICE_REQUEST_FAILED",{requestId,...issuanceFailureDiagnostic(stage,error)});
    if(blockedContext)await recordBlockedEmission(blockedContext,requestId,stage,"SERVER_ERROR",`Erro interno na etapa ${stage}. Código de atendimento: ${requestId}.`);
    return NextResponse.json({error:"Não foi possível concluir a emissão. Informe o código de atendimento ao escritório.",requestId},{status:500,headers:{"X-Request-ID":requestId}});
  }
}
