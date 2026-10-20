import "server-only";
import municipios from "@/lib/nfse/data/municipios-ibge.json";

const tabela = municipios as unknown as Record<string, [string, string]>;

/** "Belo Horizonte/MG" a partir do código IBGE de 7 dígitos; o próprio código se não estiver na tabela. */
export function nomeMunicipio(codigo: string | null | undefined) {
  if (!codigo) return "—";
  const item = tabela[codigo];
  return item ? `${item[0]}/${item[1]}` : codigo;
}
