import "server-only";
import municipios from "@/lib/nfse/data/municipios-ibge.json";

const tabela = municipios as unknown as Record<string, [string, string]>;

/** "Belo Horizonte/MG" a partir do código IBGE de 7 dígitos; o próprio código se não estiver na tabela. */
export function nomeMunicipio(codigo: string | null | undefined) {
  if (!codigo) return "—";
  const item = tabela[codigo];
  return item ? `${item[0]}/${item[1]}` : codigo;
}

const semAcento = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, " ").trim().toUpperCase();
let porNome: Map<string, string> | null = null;

/** Código IBGE pelo nome da cidade e a UF ("Rio de Janeiro", "RJ" → "3304557"); null se não achar. */
export function codigoMunicipio(nome: string | null | undefined, uf: string | null | undefined) {
  if (!nome || !uf) return null;
  porNome ??= new Map(Object.entries(tabela).map(([codigo, [n, u]]) => [`${semAcento(n)}/${u.toUpperCase()}`, codigo]));
  return porNome.get(`${semAcento(nome)}/${uf.trim().toUpperCase()}`) ?? null;
}
