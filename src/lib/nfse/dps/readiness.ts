import { LocalCertificateProvider } from "../certificate/local-provider";
import type { CertificateProvider } from "../certificate/provider";
import { SafeFiscalError } from "../errors";
import type { DpsFiscalConfiguration, DpsPerson } from "./model";

export type DpsOrganizationReadiness = {
  legalName: string;
  taxId: string;
  municipalRegistration: string;
  municipalityCode: string;
  address: NonNullable<DpsPerson["address"]> & { stateOrProvince: string };
};

export type DpsServiceReadiness = {
  nationalTaxCode: string;
  municipalTaxCode: string;
  locationMunicipalityCode: string;
};

export type DpsCustomerReadiness = Pick<DpsPerson, "name" | "taxId" | "foreignTaxId" | "noForeignTaxIdReason" | "address">;

function incomplete(scope: string): never {
  throw new SafeFiscalError("FISCAL_CONFIGURATION_INCOMPLETE", `A prontidão DPS de ${scope} não está completa.`);
}

function assertDomesticAddress(address: NonNullable<DpsPerson["address"]> | undefined, scope: string) {
  if (!address || !address.street || !address.number || !address.neighborhood || !address.postalCode || !address.municipalityCode) incomplete(scope);
  if (address.countryCode && address.countryCode !== "BR") incomplete(scope);
  return address;
}

/**
 * Validates the data boundary before DpsModel/XML construction. It deliberately
 * does not fill any fiscal or registration value: missing data blocks the flow.
 */
export async function assertDpsReadiness(input: {
  organization: DpsOrganizationReadiness;
  service: DpsServiceReadiness;
  /** Ausente = Tomador/Adquirente não informado (a DPS sai sem o grupo toma, permitido pelo leiaute). */
  customer?: DpsCustomerReadiness;
  fiscal: DpsFiscalConfiguration;
  verifyCertificate?: boolean;
  certificateProvider?:CertificateProvider;
  organizationId?:string;
}) {
  const { organization, service, customer, fiscal } = input;
  if (!organization.legalName || !/^\d{14}$/.test(organization.taxId.replace(/\D/g, "")) || !/^\d{7}$/.test(organization.municipalityCode)) incomplete("organização");
  const issuerAddress = assertDomesticAddress(organization.address, "organização");
  if (!organization.address.stateOrProvince) incomplete("organização");

  if (!/^\d{6}$/.test(service.nationalTaxCode) || (service.municipalTaxCode && !/^\d{3}$/.test(service.municipalTaxCode)) || !/^\d{7}$/.test(service.locationMunicipalityCode)) incomplete("serviço");

  if (customer) {
    const domesticId = customer.taxId?.replace(/\D/g, "");
    if (!customer.name || !((domesticId?.length === 11 || domesticId?.length === 14) || customer.foreignTaxId || customer.noForeignTaxIdReason)) incomplete("tomador");
    if (customer.address) assertDomesticAddress(customer.address, "tomador");
  }

  if (!fiscal.regime || !fiscal.iss || !fiscal.totalTaxes || fiscal.ibsCbsRequired) incomplete("fiscal");
  if (!(["PARAMETRIZED_BY_NATIONAL", "EMITTER_PROVIDED"] as const).includes(fiscal.iss.rateSource)) incomplete("fiscal");
  if (fiscal.iss.rateSource === "EMITTER_PROVIDED" && fiscal.iss.rateBasisPoints === undefined) incomplete("fiscal");
  if (fiscal.iss.rateSource === "PARAMETRIZED_BY_NATIONAL" && fiscal.iss.rateBasisPoints !== undefined) incomplete("fiscal");

  if (input.verifyCertificate !== false) {
    try{await (input.certificateProvider??new LocalCertificateProvider()).getCertificateMaterial({organizationId:input.organizationId});}
    catch{throw new SafeFiscalError("CERTIFICATE_LOAD_FAILED", "O certificado A1 não está apto para assinar a DPS.");}
  }

  return { issuerAddress, certificateVerified: input.verifyCertificate !== false };
}
