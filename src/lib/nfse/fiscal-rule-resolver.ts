import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SafeFiscalError } from "./errors";
import { MunicipalParametersProvider,issPercentToBasisPoints,parseMunicipalServiceCode,type MunicipalRetentions } from "./municipal-parameters/client";
import { MtlsHttpClient } from "./client/mtls-http-client";
import { OrganizationCertificateProvider } from "./certificate/organization-provider";
import { issRateSourceSchema, matchesAcceptedProductionDpsReference, type IssRateSource } from "./service-fiscal-reference";
import { issuerMunicipalRegistrationEmissionSchema } from "./fiscal-configuration";

const dpsTaxConfigurationSchema=z.object({iss:z.object({withholdingType:z.enum(["1","2","3"]),benefitNumber:z.string().min(1).optional()}),regime:z.object({simpleNational:z.enum(["1","2","3"]),simpleAssessment:z.enum(["1","2","3"]).optional(),special:z.enum(["0","1","2","3","4","5","6","9"])}),totalTaxes:z.object({indicator:z.literal("0")}),issuerMunicipalRegistrationEmission:issuerMunicipalRegistrationEmissionSchema.optional()});
const storedDpsTaxConfigurationSchema=z.union([dpsTaxConfigurationSchema,z.object({version:z.literal(1),form:z.unknown(),technical:dpsTaxConfigurationSchema.optional()})]);
export type FiscalResolutionInput={organizationId?:string;municipalityCode:string;nationalTaxCode:string;municipalServiceCode?:string|null;dpsMunicipalTaxCode?:string|null;nbsCode?:string|null;issTaxation?:"1"|"2"|"3"|"4"|null;issRateSource?:IssRateSource|null;fiscalReference?:unknown;taxRegime:"SIMPLES_NACIONAL"|"LUCRO_PRESUMIDO"|"LUCRO_REAL"|null;reviewedAt?:string|null;/** Perfil automático aceito (empresa sem exigência de revisão): vale no lugar de reviewedAt. */automaticProfile?:boolean;/** Serviço automático do ADN (passo 2 com a lista nacional): PARAMETRIZED sem nota de referência, conferido nos parâmetros do município. */automaticService?:boolean;serviceDate:string;dpsConfiguration:unknown;manualRateBasisPoints?:number;manualRateSourceNote?:string};
export type FiscalResolution={municipalityCode:string;nationalTaxCode:string;municipalServiceCode?:string;iss:{taxation:"1"|"2"|"3"|"4";rateBasisPoints?:number;/** Só para a prévia: a alíquota que o município parametrizou, quando a DPS sai sem pAliq. */parametrizedRateBasisPoints?:number;rateSource:IssRateSource;withholdingType:"1"|"2"|"3";source:"MUNICIPAL_INTEGRATION"|"ACCEPTED_PRODUCTION_DPS"|"OFFICE_PARAMETER"};retention:{officialRulesChecked:boolean};dpsConfiguration:z.infer<typeof dpsTaxConfigurationSchema>;issuerMunicipalRegistrationEmission:"SEND"|"OMIT";source:"MUNICIPAL_PARAMETERS"|"ACCEPTED_PRODUCTION_DPS"|"OFFICE_PARAMETER";validity:{validFrom:string;validUntil?:string};manualRateSourceNote?:string};

export async function resolveFiscalConfiguration(input:FiscalResolutionInput):Promise<FiscalResolution>{
  if(!input.reviewedAt&&!input.automaticProfile)throw incomplete(MSG.perfil);
  let dpsConfiguration:z.infer<typeof dpsTaxConfigurationSchema>;
  try{const stored=storedDpsTaxConfigurationSchema.parse(input.dpsConfiguration);dpsConfiguration="version" in stored?(stored.technical??(() => {throw new Error("TECHNICAL_CONFIGURATION_PENDING");})()):stored;}
  catch{throw incomplete(MSG.perfil);}
  const issuerMunicipalRegistrationEmission=dpsConfiguration.issuerMunicipalRegistrationEmission?.mode??"SEND";
  const parsedRateSource=issRateSourceSchema.safeParse(input.issRateSource);
  if(!input.issTaxation||!parsedRateSource.success)throw incomplete(MSG.tributacao);
  const issRateSource=parsedRateSource.data;
  // Isento/imune has no municipal rate to look up — 0% is the definitionally
  // correct answer, not a guess, so the municipal service code (the rate
  // lookup key for taxable operations) is not required in this case.
  if(input.issTaxation==="3"||input.issTaxation==="4"){
    return{municipalityCode:input.municipalityCode,nationalTaxCode:input.nationalTaxCode,iss:{taxation:input.issTaxation,rateSource:issRateSource,withholdingType:dpsConfiguration.iss.withholdingType,source:"MUNICIPAL_INTEGRATION",...(issRateSource==="EMITTER_PROVIDED"?{rateBasisPoints:0}:{})},retention:{officialRulesChecked:false},dpsConfiguration,issuerMunicipalRegistrationEmission,source:"MUNICIPAL_PARAMETERS",validity:{validFrom:input.serviceDate}};
  }
  // Vale para o serviço automático e para o do escritório que já tem o código complementar: um caminho só, sem alíquota digitada.
  if(issRateSource==="PARAMETRIZED_BY_NATIONAL"&&!hasFiscalReference(input.fiscalReference)&&(input.automaticService||input.municipalServiceCode)){
    // Como o Emissor Nacional: a DPS sai sem pAliq e a Receita aplica a alíquota do município. Antes, confere nos parâmetros do
    // município que o código existe, tem incidência e não tem retenção obrigatória (o portal ainda não pergunta pela retenção).
    if(!input.municipalServiceCode)throw incomplete(MSG.codigoComplementar);
    const serviceCode=parseMunicipalServiceCode(input.municipalServiceCode);
    const provider=new MunicipalParametersProvider(new MtlsHttpClient(new OrganizationCertificateProvider()),undefined,input.organizationId);
    const[rule,retentions]=await Promise.all([cachedRule(input.municipalityCode,serviceCode,input.serviceDate),provider.getRetentions({municipalityCode:input.municipalityCode,competence:input.serviceDate})]);
    const current=rule??await fetchRule(input.municipalityCode,serviceCode,input.serviceDate,provider);
    if(current.incidence!=="SIM"||current.iss_rate_percent===null)throw incomplete(MSG.semIncidencia);
    if(requiresMunicipalRetention(retentions,serviceCode,input.serviceDate))throw new SafeFiscalError("MUNICIPAL_RETENTION_REQUIRED","Neste município o ISS deste serviço é retido pelo tomador. Peça ao escritório para configurar este serviço antes de emitir.");
    return{municipalityCode:input.municipalityCode,nationalTaxCode:input.nationalTaxCode,municipalServiceCode:serviceCode,iss:{taxation:input.issTaxation,parametrizedRateBasisPoints:issPercentToBasisPoints(Number(current.iss_rate_percent)),rateSource:issRateSource,withholdingType:dpsConfiguration.iss.withholdingType,source:"MUNICIPAL_INTEGRATION"},retention:{officialRulesChecked:true},dpsConfiguration,issuerMunicipalRegistrationEmission,source:"MUNICIPAL_PARAMETERS",validity:{validFrom:current.valid_from,...(current.valid_until?{validUntil:current.valid_until}:{})}};
  }
  if(issRateSource==="PARAMETRIZED_BY_NATIONAL"){
    if(!input.dpsMunicipalTaxCode||!matchesAcceptedProductionDpsReference(input.fiscalReference,{nationalTaxCode:input.nationalTaxCode,municipalTaxCode:input.dpsMunicipalTaxCode,nbsCode:input.nbsCode}))throw incomplete(MSG.referencia);
    const reference=input.fiscalReference as {referenceCompetence:string;issTaxation:string;issWithholding:string};
    if(reference.issTaxation!==input.issTaxation||reference.issWithholding!==dpsConfiguration.iss.withholdingType)throw incomplete(MSG.referencia);
    return{municipalityCode:input.municipalityCode,nationalTaxCode:input.nationalTaxCode,iss:{taxation:input.issTaxation,rateSource:issRateSource,withholdingType:dpsConfiguration.iss.withholdingType,source:"ACCEPTED_PRODUCTION_DPS"},retention:{officialRulesChecked:false},dpsConfiguration,issuerMunicipalRegistrationEmission,source:"ACCEPTED_PRODUCTION_DPS",validity:{validFrom:reference.referenceCompetence}};
  }
  if(!input.municipalServiceCode){
    // No municipal mapping on file for this municipality/service — rather
    // than block issuance entirely, accept a rate the office confirms and
    // cites at the moment of emission (never silently defaulted or guessed).
    if(input.manualRateBasisPoints===undefined||!input.manualRateSourceNote?.trim())throw new SafeFiscalError("FISCAL_SERVICE_MAPPING_MISSING",MSG.codigoComplementar);
    return{municipalityCode:input.municipalityCode,nationalTaxCode:input.nationalTaxCode,iss:{taxation:input.issTaxation,rateBasisPoints:input.manualRateBasisPoints,rateSource:issRateSource,withholdingType:dpsConfiguration.iss.withholdingType,source:"OFFICE_PARAMETER"},retention:{officialRulesChecked:false},dpsConfiguration,issuerMunicipalRegistrationEmission,source:"OFFICE_PARAMETER",validity:{validFrom:input.serviceDate},manualRateSourceNote:input.manualRateSourceNote.trim()};
  }
  const serviceCode=parseMunicipalServiceCode(input.municipalServiceCode);
  const cached=await cachedRule(input.municipalityCode,serviceCode,input.serviceDate);
  // Real organizations never fall back to NFSE_CERT_PATH. Local smoke tests omit organizationId explicitly.
  const provider=input.organizationId?new MunicipalParametersProvider(new MtlsHttpClient(new OrganizationCertificateProvider()),undefined,input.organizationId):new MunicipalParametersProvider();
  const rule=cached??await fetchRule(input.municipalityCode,serviceCode,input.serviceDate,provider);
  await Promise.all([
    provider.getRetentions({municipalityCode:input.municipalityCode,competence:input.serviceDate}),
    ...(dpsConfiguration.regime.special!=="0"?[provider.getSpecialRegimes({municipalityCode:input.municipalityCode,serviceCode,competence:input.serviceDate})]:[]),
    ...(dpsConfiguration.iss.benefitNumber?[provider.getBenefit({municipalityCode:input.municipalityCode,benefitNumber:dpsConfiguration.iss.benefitNumber,competence:input.serviceDate})]:[]),
  ]);
  if(rule.incidence!=="SIM"||rule.iss_rate_percent===null)throw incomplete(MSG.semIncidencia);
  return{municipalityCode:input.municipalityCode,nationalTaxCode:input.nationalTaxCode,municipalServiceCode:serviceCode,iss:{taxation:input.issTaxation,rateBasisPoints:issPercentToBasisPoints(Number(rule.iss_rate_percent)),rateSource:issRateSource,withholdingType:dpsConfiguration.iss.withholdingType,source:"MUNICIPAL_INTEGRATION"},retention:{officialRulesChecked:true},dpsConfiguration,issuerMunicipalRegistrationEmission,source:"MUNICIPAL_PARAMETERS",validity:{validFrom:rule.valid_from,...(rule.valid_until?{validUntil:rule.valid_until}:{})}};
}

async function cachedRule(municipalityCode:string,serviceCode:string,serviceDate:string){
  const{data}=await createAdminClient().from("municipal_tax_rules").select("incidence,iss_rate_percent,valid_from,valid_until").eq("municipality_code",municipalityCode).eq("service_code",serviceCode).lte("valid_from",`${serviceDate}T23:59:59Z`).or(`valid_until.is.null,valid_until.gte.${serviceDate}T00:00:00Z`).order("valid_from",{ascending:false}).limit(1).maybeSingle();
  return data;
}

/** Retenção municipal obrigatória vigente para o código completo na competência (lista de retenções do município no ADN). */
export function requiresMunicipalRetention(retentions:MunicipalRetentions,serviceCode:string,competence:string){
  const vigente=(inicio:string,fim:string|null)=>inicio.slice(0,10)<=competence&&(!fim||fim.slice(0,10)>=competence);
  return(retentions.retencoes.retencoesMunicipais??[]).some(regra=>vigente(regra.dataInicioVigencia,regra.dataFimVigencia)
    &&(regra.servicos??[]).some(servico=>servico.codigoCompleto===serviceCode&&(servico.historico??[{dataInicioVigencia:regra.dataInicioVigencia,dataFimVigencia:regra.dataFimVigencia}]).some(h=>vigente(h.dataInicioVigencia,h.dataFimVigencia))));
}

/** A coluna guarda {} quando o serviço ainda não tem DPS aceita de referência. */
function hasFiscalReference(value:unknown){return Boolean(value&&typeof value==="object"&&Object.keys(value).length);}

/** Cada bloqueio diz o que falta e onde corrigir (antes era uma frase só para todos os casos). */
export const MSG={
  perfil:"A configuração fiscal da empresa (regime, Simples Nacional, ISS) ainda não foi confirmada. O escritório confirma em Empresa → Configuração fiscal.",
  tributacao:"O serviço está sem a tributação do ISS. Volte ao passo Serviço e escolha o código de novo.",
  codigoComplementar:"Falta o Código Complementar Municipal deste serviço. Volte ao passo Serviço e escolha o código complementar: a alíquota vem da Receita, como no Emissor Nacional.",
  semIncidencia:"O município não cobra ISS neste código complementar (sem incidência). Volte ao passo Serviço e escolha outro código complementar.",
  referencia:"Este serviço foi configurado a partir de uma nota anterior que não bate mais com ele. Peça ao escritório para revisar o serviço.",
} as const;

function incomplete(message:string){return new SafeFiscalError("FISCAL_CONFIGURATION_INCOMPLETE",message);}
async function fetchRule(municipalityCode:string,serviceCode:string,competence:string,provider:MunicipalParametersProvider){
  const response=await provider.getAliquota({municipalityCode,serviceCode,competence});
  const item=response.aliquotas[serviceCode].find(value=>!value.DtFim||value.DtFim>=`${competence}T00:00:00`)??response.aliquotas[serviceCode][0];
  const row={municipality_code:municipalityCode,service_code:serviceCode,incidence:item.Incidencia,iss_rate_percent:item.Aliq,valid_from:item.DtIni,valid_until:item.DtFim,source:"ADN_PRODUCTION_RESTRICTED",source_version:null,fetched_at:new Date().toISOString()};
  const{error}=await createAdminClient().from("municipal_tax_rules").upsert(row,{onConflict:"municipality_code,service_code,incidence,valid_from,source"});
  if(error)throw new SafeFiscalError("MUNICIPAL_PARAMETERS_INVALID","Não foi possível registrar os parâmetros municipais.");
  return{incidence:row.incidence,iss_rate_percent:row.iss_rate_percent,valid_from:row.valid_from,valid_until:row.valid_until};
}
