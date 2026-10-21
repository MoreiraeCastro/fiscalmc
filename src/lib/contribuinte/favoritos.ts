import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { type DadosRascunho, type IbsCbsRascunho, type ServicoRascunho, type TomadorRascunho } from "./dps";
import { hojeBrasilia } from "./formato";

/** O Emissor Nacional permite até 10 serviços favoritos. */
export const FAVORITOS_MAX = 10;

export type DadosFavorito = {
  servico: ServicoRascunho;
  tomador?: TomadorRascunho;
  semTomador?: boolean;
  valorCentavos?: number;
  informarIbsCbs?: boolean;
  ibsCbs?: IbsCbsRascunho;
};
export type Favorito = { id: string; nome: string; dados: DadosFavorito; atualizadoEm: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Linha = { id: string; name: string; data: unknown; updated_at: string };
const paraFavorito = (linha: Linha): Favorito => ({ id: linha.id, nome: linha.name, dados: linha.data as DadosFavorito, atualizadoEm: linha.updated_at });

export async function listarFavoritos(empresaId: string): Promise<Favorito[]> {
  const { data } = await createAdminClient().from("service_favorites").select("id,name,data,updated_at").eq("organization_id", empresaId).order("name").limit(FAVORITOS_MAX + 5);
  return (data ?? []).map(paraFavorito);
}

export async function carregarFavorito(empresaId: string, id: string): Promise<Favorito | null> {
  if (!UUID.test(id)) return null;
  const { data } = await createAdminClient().from("service_favorites").select("id,name,data,updated_at").eq("organization_id", empresaId).eq("id", id).maybeSingle();
  return data ? paraFavorito(data) : null;
}

/** Cria ou atualiza. Recusa o 11º favorito da empresa. */
export async function gravarFavorito(input: { empresaId: string; usuarioId: string; id: string | null; nome: string; dados: DadosFavorito }): Promise<{ ok: true; id: string } | { ok: false; mensagem: string }> {
  const db = createAdminClient();
  const agora = new Date().toISOString();
  if (input.id) {
    const { error } = await db.from("service_favorites").update({ name: input.nome, data: input.dados, updated_by: input.usuarioId, updated_at: agora }).eq("organization_id", input.empresaId).eq("id", input.id);
    return error ? { ok: false, mensagem: "Não foi possível salvar o favorito." } : { ok: true, id: input.id };
  }
  const { count } = await db.from("service_favorites").select("id", { count: "exact", head: true }).eq("organization_id", input.empresaId);
  if ((count ?? 0) >= FAVORITOS_MAX) return { ok: false, mensagem: `Esta empresa já tem ${FAVORITOS_MAX} serviços favoritos. Exclua um para incluir outro.` };
  const { data, error } = await db.from("service_favorites").insert({ organization_id: input.empresaId, name: input.nome, data: input.dados, created_by: input.usuarioId, updated_by: input.usuarioId }).select("id").single();
  return error || !data ? { ok: false, mensagem: "Não foi possível salvar o favorito." } : { ok: true, id: data.id as string };
}

export async function excluirFavorito(empresaId: string, id: string) {
  if (!UUID.test(id)) return;
  await createAdminClient().from("service_favorites").delete().eq("organization_id", empresaId).eq("id", id);
}

/** Rascunho a partir do favorito: competência de hoje e o resto pré-preenchido, já no passo que faltar. */
export function rascunhoDoFavorito(favorito: DadosFavorito, hoje = hojeBrasilia()): DadosRascunho {
  return {
    competencia: hoje,
    ...(favorito.semTomador ? { semTomador: true } : favorito.tomador ? { tomador: favorito.tomador } : {}),
    servico: favorito.servico,
    ...(favorito.valorCentavos ? { valores: { valorCentavos: favorito.valorCentavos } } : {}),
    ...(favorito.informarIbsCbs ? { informarIbsCbs: true, ...(favorito.ibsCbs ? { ibsCbs: favorito.ibsCbs } : {}) } : {}),
  };
}

/** Favorito a partir de um rascunho (botão "Salvar como favorito" no passo 4). */
export function favoritoDoRascunho(dados: DadosRascunho): DadosFavorito | null {
  if (!dados.servico) return null;
  return {
    servico: dados.servico,
    ...(dados.semTomador ? { semTomador: true } : dados.tomador ? { tomador: dados.tomador } : {}),
    ...(dados.valores ? { valorCentavos: dados.valores.valorCentavos } : {}),
    ...(dados.informarIbsCbs ? { informarIbsCbs: true, ...(dados.ibsCbs ? { ibsCbs: dados.ibsCbs } : {}) } : {}),
  };
}

