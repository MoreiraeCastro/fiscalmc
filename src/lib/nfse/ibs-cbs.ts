// IBS/CBS (reforma tributária): quando é obrigatório e os valores padrão para serviços. Funções puras.
import type { NFSeEnvironment } from "./types";

/** A partir desta competência a SEFIN recusa DPS sem IBS/CBS (restrita: visto em 20/10/2026; produção: NT 004). */
export const IBS_CBS_OBRIGATORIO_DESDE: Record<NFSeEnvironment, string> = {
  PRODUCTION: "2027-01-01",
  PRODUCTION_RESTRICTED: "2026-10-01",
};

/** Antes disso o IBS/CBS é permitido (opcional) desde a competência 12/2025. */
export const IBS_CBS_PERMITIDO_DESDE = "2025-12-01";

export function ibsCbsObrigatorio(environment: NFSeEnvironment, competencia: string) {
  return competencia >= IBS_CBS_OBRIGATORIO_DESDE[environment];
}

export function ibsCbsPermitido(competencia: string) {
  return competencia >= IBS_CBS_PERMITIDO_DESDE;
}

/** Padrão para serviços tributados integralmente (o mesmo que o Emissor Nacional sugere para contabilidade). */
export const IBS_CBS_PADRAO = { finalConsumer: "0", operationIndicator: "100301", destinationIndicator: "0", cst: "000", classification: "000001" } as const;

/** Códigos de Situação Tributária do IBS/CBS (lista do Emissor Nacional). */
export const CST_IBS_CBS: Record<string, string> = {
  "000": "Tributação integral",
  "010": "Tributação com alíquotas uniformes",
  "011": "Tributação com alíquotas uniformes reduzidas",
  "200": "Alíquota reduzida",
  "220": "Alíquota fixa",
  "221": "Alíquota fixa proporcional",
  "222": "Redução de base de cálculo",
  "400": "Isenção",
  "410": "Imunidade e não incidência",
  "510": "Diferimento",
  "515": "Diferimento com redução de alíquota",
  "550": "Suspensão",
  "800": "Transferência de crédito",
  "811": "Ajustes",
  "820": "Tributação em declaração de regime específico",
  "830": "Exclusão da base de cálculo",
};
