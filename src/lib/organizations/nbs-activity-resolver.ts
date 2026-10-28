import "server-only";
import correlations from "./activity-nbs-correlations.json";
// Tabela NBS 2.0 completa (aba LISTA.NBS_v2.0 do Anexo B do SN NFS-e): só os itens de 9 dígitos, que são os que vão na DPS.
import nbsTable from "./nbs-v2.json";

type Correlation = { lc116Item: string; lc116Subitem: string; lc116Description: string; nbsCode: string; nbsDisplayCode: string; nbsDescription: string };

/** `oficial`: está na tabela oficial de correlação com o código da LC 116 escolhido. */
export type NbsCandidate = { nbsCode: string; nbsDisplayCode: string; nbsDescription: string; oficial?: boolean };

const allNbs: NbsCandidate[] = [...(nbsTable as NbsCandidate[])].sort((a, b) => a.nbsDisplayCode.localeCompare(b.nbsDisplayCode));

/** Todas as NBS que podem ir na DPS, para o seletor completo do passo Serviço. */
export function allNbsCatalog(): NbsCandidate[] {
  return allNbs;
}

/**
 * Free-text search across every NBS code in the official Anexo VIII table,
 * independent of whichever LC116 national code was selected — the same
 * service can be classified under different LC116 items depending on how
 * the office frames it, so the NBS choice must not be constrained to only
 * the codes correlated to one specific activity. Never picks one on its
 * own — a human always makes the final call.
 */
export function searchNbsCatalog(query: string, limit = 60): NbsCandidate[] {
  const q = query.trim().toLocaleLowerCase("pt-BR");
  const qDigits = query.replace(/\D/g, "");
  const pool = q
    ? allNbs.filter((item) => item.nbsDisplayCode.toLowerCase().includes(q)
      || item.nbsDescription.toLocaleLowerCase("pt-BR").includes(q)
      || (qDigits.length >= 2 && item.nbsCode.includes(qDigits)))
    : allNbs;
  return pool.slice(0, limit);
}

/**
 * NBS que fazem sentido para um item/subitem da LC 116 (o cTribNac começa por eles), para o passo Serviço:
 * todas as NBS das mesmas posições (os 5 primeiros dígitos) das que a tabela oficial correlaciona.
 * A tabela liga a medicina (04.01) só à 1.2301.22.00, mas o grupo 1.2301 (saúde humana) inteiro é possível —
 * inclusive a 1.2301.99.00 que o escritório usa. As da correlação oficial vêm primeiro, com `oficial`.
 */
export function nbsForLc116(item: string, subitem: string): NbsCandidate[] {
  const i = String(Number(item));
  const s = String(Number(subitem));
  const oficiais = new Set((correlations as Correlation[]).filter((row) => row.lc116Item === i && row.lc116Subitem === s).map((row) => row.nbsCode));
  const posicoes = new Set([...oficiais].map((code) => code.slice(0, 5)));
  const grupo = allNbs.filter((nbs) => posicoes.has(nbs.nbsCode.slice(0, 5)) || oficiais.has(nbs.nbsCode)).map((nbs) => ({ ...nbs, oficial: oficiais.has(nbs.nbsCode) }));
  return [...grupo.filter((nbs) => nbs.oficial), ...grupo.filter((nbs) => !nbs.oficial)];
}

export function findNbs(code: string): NbsCandidate | null {
  return allNbs.find((item) => item.nbsCode === code) ?? null;
}
