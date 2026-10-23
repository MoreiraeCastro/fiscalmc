import type { NFSeEnvironment } from "../types";

/**
 * Resolves the configured destination without authorizing a fiscal POST. This
 * distinction is intentional: authenticated, read-only Production checks are
 * safe while ENABLE_NFSE_PRODUCTION remains false.
 */
export function getConfiguredNFSeEnvironment(): NFSeEnvironment {
  return process.env.NFSE_ENV?.toLowerCase() === "production"
    ? "PRODUCTION"
    : "PRODUCTION_RESTRICTED";
}

export function getNFSeEnvironment(): NFSeEnvironment {
  const environment = getConfiguredNFSeEnvironment();
  if (environment === "PRODUCTION") {
    if (process.env.ENABLE_NFSE_PRODUCTION !== "true") throw new Error("Produção fiscal está bloqueada. Homologue antes e defina ENABLE_NFSE_PRODUCTION=true conscientemente.");
    return "PRODUCTION";
  }
  return "PRODUCTION_RESTRICTED";
}

export const endpoints = {
  PRODUCTION_RESTRICTED: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
  PRODUCTION: "https://sefin.nfse.gov.br/SefinNacional"
} as const;

export const municipalParametersEndpoints = {
  PRODUCTION_RESTRICTED: "https://adn.producaorestrita.nfse.gov.br/parametrizacao",
  PRODUCTION: "https://adn.nfse.gov.br/parametrizacao",
} as const;

/** Distribuição de documentos ao contribuinte (NFS-e Recebidas): GET {base}/DFe/{ultimoNSU}?lote=true. Só leitura. */
export const distributionEndpoints = {
  PRODUCTION_RESTRICTED: "https://adn.producaorestrita.nfse.gov.br/contribuintes",
  PRODUCTION: "https://adn.nfse.gov.br/contribuintes",
} as const;

export const danfseEndpoints = {
  PRODUCTION_RESTRICTED: "https://adn.producaorestrita.nfse.gov.br/danfse",
  PRODUCTION: "https://adn.nfse.gov.br/danfse",
} as const;

export function getMunicipalParametersBaseUrl(environment: NFSeEnvironment = getNFSeEnvironment()) {
  return municipalParametersEndpoints[environment];
}
