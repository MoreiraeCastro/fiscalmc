import "server-only";
import { SafeFiscalError } from "../errors";
import { MtlsHttpClient } from "../client/mtls-http-client";
import { OrganizationCertificateProvider } from "../certificate/organization-provider";
import { MunicipalParametersProvider, issPercentToBasisPoints, type AliquotaItem } from "./client";

/** Um "Código Complementar Municipal" (cTribNac + 3 dígitos do município) com a alíquota vigente na competência. */
export type MunicipalServiceOption = { code: string; suffix: string; incidence: string; rateBasisPoints: number; validFrom: string };

const LOTE = 6;
const LIMITE = 30;
const VALIDADE_CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { em: number; opcoes: MunicipalServiceOption[] }>();

export function displayNationalCode(nationalTaxCode: string) {
  return `${nationalTaxCode.slice(0, 2)}.${nationalTaxCode.slice(2, 4)}.${nationalTaxCode.slice(4, 6)}`;
}

/** Item de alíquota que vale na competência (o mesmo critério do resolvedor fiscal). */
export function rateForCompetence(items: AliquotaItem[], competence: string) {
  return items.find((item) => item.DtIni.slice(0, 10) <= competence && (!item.DtFim || item.DtFim.slice(0, 10) >= competence)) ?? null;
}

/**
 * Sufixos a consultar no próximo lote. O ADN não tem lista de códigos por município: só responde a alíquota de um código completo
 * (00.00.00.000). Na consulta de 23/10/2026, Porto Alegre usa só o .000 e o Rio só o .001 em diante. Então se tenta o .000 e uma
 * sequência a partir do .001, e só se continua enquanto o último lote achou algum código.
 */
export function nextSuffixes(tried: number, foundInLastBatch: boolean) {
  if (tried === 0) return Array.from({ length: LOTE }, (_, i) => i);
  if (!foundInLastBatch || tried >= LIMITE) return [];
  return Array.from({ length: Math.min(LOTE, LIMITE - tried) }, (_, i) => tried + i);
}

/**
 * Códigos complementares que o município tem para um código de tributação nacional, como o Emissor Nacional mostra no passo 2.
 * Consulta só de leitura (GET nos parâmetros municipais do ADN, com o A1 da própria empresa).
 */
export async function discoverMunicipalServiceCodes(input: { organizationId: string; municipalityCode: string; nationalTaxCode: string; competence: string }): Promise<MunicipalServiceOption[]> {
  const chave = `${input.municipalityCode}|${input.nationalTaxCode}|${input.competence.slice(0, 7)}`;
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < VALIDADE_CACHE_MS) return guardado.opcoes;

  const provider = new MunicipalParametersProvider(new MtlsHttpClient(new OrganizationCertificateProvider()), undefined, input.organizationId);
  const base = displayNationalCode(input.nationalTaxCode);
  const opcoes: MunicipalServiceOption[] = [];
  let tentados = 0;
  let achouNoLote = false;
  let falhas = 0;
  for (let lote = nextSuffixes(0, false); lote.length; lote = nextSuffixes(tentados, achouNoLote)) {
    const respostas = await Promise.all(lote.map(async (sufixo) => {
      const code = `${base}.${String(sufixo).padStart(3, "0")}`;
      try {
        return { code, itens: await provider.findAliquota({ municipalityCode: input.municipalityCode, serviceCode: code, competence: input.competence }) };
      } catch {
        falhas += 1;
        return { code, itens: null };
      }
    }));
    tentados += lote.length;
    // O .000 não conta para seguir adiante: no Rio ele não existe e os complementos começam no .001.
    achouNoLote = respostas.some((resposta) => resposta.itens?.length && !resposta.code.endsWith(".000"));
    for (const { code, itens } of respostas) {
      const vigente = itens ? rateForCompetence(itens, input.competence) : null;
      if (vigente) opcoes.push({ code, suffix: code.slice(-3), incidence: vigente.Incidencia, rateBasisPoints: issPercentToBasisPoints(vigente.Aliq), validFrom: vigente.DtIni });
    }
  }
  if (!opcoes.length && falhas) throw new SafeFiscalError("MUNICIPAL_PARAMETERS_UNAVAILABLE", "Não foi possível consultar os parâmetros do município agora. Tente de novo em instantes.", true);
  cache.set(chave, { em: Date.now(), opcoes });
  return opcoes;
}
