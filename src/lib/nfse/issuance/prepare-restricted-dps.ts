import "server-only";
import type { FiscalDocumentDomain } from "../types";
import type { DpsFiscalConfiguration,DpsIbsCbs,DpsPerson,DpsSubstitution } from "../dps/model";
import { mapToDpsModel } from "../dps/model";
import { assertDpsReadiness } from "../dps/readiness";
import { buildDpsXml } from "../dps/xml";
import { validateDpsXml } from "../dps/xsd";
import { signDpsXml,verifyDpsSignature } from "../dps/signature";
import { buildSefinDpsRequest } from "../dps/sefin-request";
import { formatDpsDateTimeSaoPaulo } from "../dps/date-time";
import { OrganizationCertificateProvider } from "../certificate/organization-provider";
import { SafeFiscalError } from "../errors";
import type { NFSeEnvironment } from "../types";

type OrganizationInput={legalName:string;taxId:string;municipalRegistration:string;municipalityCode:string;postalCode:string;street:string;addressNumber:string;addressComplement?:string|null;neighborhood:string;state:string;email?:string|null;phone?:string|null};
type CustomerInput={personType:string;taxId?:string|null;legalName:string;municipalRegistration?:string|null;postalCode?:string|null;street?:string|null;addressNumber?:string|null;addressComplement?:string|null;neighborhood?:string|null;municipalityCode?:string|null;state?:string|null;countryCode:string;email?:string|null;phone?:string|null};
export type RestrictedDpsPreparationStage="PREPARE_DPS"|"BUILD_DOCUMENT"|"UNSIGNED_XSD"|"XMLDSIG"|"SIGNATURE_VERIFICATION"|"SIGNED_XSD"|"GZIP_BASE64";

function customerPerson(customer:CustomerInput):DpsPerson{
  if(customer.personType==="FOREIGN")throw new SafeFiscalError("FISCAL_CONFIGURATION_INCOMPLETE","O cadastro fiscal do tomador estrangeiro precisa ser revisado.");
  const hasAddress=Boolean(customer.street||customer.addressNumber||customer.neighborhood||customer.postalCode||customer.municipalityCode);
  return{name:customer.legalName,...(customer.taxId?{taxId:customer.taxId}:{}),...(customer.municipalRegistration?{municipalRegistration:customer.municipalRegistration}:{}),...(customer.email?{email:customer.email}:{}),...(customer.phone?{phone:customer.phone}:{}),...(hasAddress?{address:{street:customer.street??"",number:customer.addressNumber??"",...(customer.addressComplement?{complement:customer.addressComplement}:{}),neighborhood:customer.neighborhood??"",postalCode:customer.postalCode??"",municipalityCode:customer.municipalityCode??"",stateOrProvince:customer.state??"",countryCode:customer.countryCode}}:{})};
}

export async function prepareRestrictedDps(input:{organizationId:string;document:FiscalDocumentDomain;organization:OrganizationInput;customer?:CustomerInput;service:{nationalTaxCode:string;dpsMunicipalTaxCode:string;nbsCode?:string|null;locationMunicipalityCode:string};fiscal:DpsFiscalConfiguration;environment?:NFSeEnvironment;issuerMunicipalRegistrationEmission?:"SEND"|"OMIT";substitution?:DpsSubstitution;ibsCbs?:DpsIbsCbs;onStage?:(stage:RestrictedDpsPreparationStage)=>void}){
  input.onStage?.("PREPARE_DPS");
  const certificateProvider=new OrganizationCertificateProvider();
  const issuer:DpsPerson={taxId:input.organization.taxId,name:input.organization.legalName,municipalRegistration:input.organization.municipalRegistration,emitName:false,emitAddress:false,...(input.issuerMunicipalRegistrationEmission==="OMIT"?{emitMunicipalRegistration:false}:{}),address:{street:input.organization.street,number:input.organization.addressNumber,...(input.organization.addressComplement?{complement:input.organization.addressComplement}:{}),neighborhood:input.organization.neighborhood,postalCode:input.organization.postalCode,municipalityCode:input.organization.municipalityCode,stateOrProvince:input.organization.state,countryCode:"BR"},...(input.organization.email?{email:input.organization.email}:{}),...(input.organization.phone?{phone:input.organization.phone}:{})};
  const customer=input.customer?customerPerson(input.customer):undefined;
  await assertDpsReadiness({organization:{legalName:input.organization.legalName,taxId:input.organization.taxId,municipalRegistration:input.organization.municipalRegistration,municipalityCode:input.organization.municipalityCode,address:{...issuer.address!,stateOrProvince:input.organization.state}},service:{nationalTaxCode:input.service.nationalTaxCode,municipalTaxCode:input.service.dpsMunicipalTaxCode,locationMunicipalityCode:input.service.locationMunicipalityCode},customer,fiscal:input.fiscal,certificateProvider,organizationId:input.organizationId});
  input.onStage?.("BUILD_DOCUMENT");
  const model=mapToDpsModel(input.document,{issuer,customer,serviceLocation:{municipalityCode:input.service.locationMunicipalityCode},dpsMunicipalTaxCode:input.service.dpsMunicipalTaxCode||undefined,nbsCode:input.service.nbsCode??undefined,fiscal:input.fiscal,emittedAt:formatDpsDateTimeSaoPaulo(new Date()),applicationVersion:"FISCALMC_0.1",environment:input.environment==="PRODUCTION"?"1":"2",...(input.substitution?{substitution:input.substitution}:{}),...(input.ibsCbs?{ibsCbs:input.ibsCbs}:{}),layout:input.environment==="PRODUCTION"?"PUBLISHED":"RTC_2026_10"});
  const unsignedXml=buildDpsXml(model);
  input.onStage?.("UNSIGNED_XSD");
  const unsignedValidation=await validateDpsXml(unsignedXml,input.environment);
  if(!unsignedValidation.valid){
    const error=new SafeFiscalError("BUILD_FAILED","A DPS gerada não passou na validação oficial.");
    Object.assign(error,{xsdDiagnostic:{errorCount:unsignedValidation.errors.length,errors:unsignedValidation.errors.slice(0,5)}});
    throw error;
  }
  input.onStage?.("XMLDSIG");
  const signedXml=await signDpsXml(unsignedXml,{certificateProvider,organizationId:input.organizationId});
  input.onStage?.("SIGNATURE_VERIFICATION");
  verifyDpsSignature(signedXml);
  input.onStage?.("SIGNED_XSD");
  const signedValidation=await validateDpsXml(signedXml,input.environment);
  if(!signedValidation.valid)throw new SafeFiscalError("SIGNATURE_FAILED","A DPS assinada não passou na validação oficial.");
  input.onStage?.("GZIP_BASE64");
  return{model,preparedPayload:buildSefinDpsRequest(signedXml)};
}
