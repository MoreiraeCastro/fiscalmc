import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DadosRascunho, NumeroPasso } from "./dps";

export type Rascunho = { id: string; passo: NumeroPasso; dados: DadosRascunho; chave: string; notaId: string | null; atualizadoEm: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Linha = { id: string; step: number; data: unknown; idempotency_key: string; invoice_id: string | null; updated_at: string };
function paraRascunho(linha: Linha): Rascunho {
  return { id: linha.id, passo: linha.step as NumeroPasso, dados: (linha.data ?? {}) as DadosRascunho, chave: linha.idempotency_key, notaId: linha.invoice_id, atualizadoEm: linha.updated_at };
}

/** Rascunho da empresa (sempre filtrado pela empresa já autorizada no contexto). */
export async function carregarRascunho(empresaId: string, id: string): Promise<Rascunho | null> {
  if (!UUID.test(id)) return null;
  const { data } = await createAdminClient().from("invoice_drafts").select("id,step,data,idempotency_key,invoice_id,updated_at")
    .eq("organization_id", empresaId).eq("id", id).maybeSingle();
  return data ? paraRascunho(data) : null;
}

/** Grava o passo: cria o rascunho no 1º "Avançar" e, depois, junta os dados e guarda o passo mais adiantado. */
export async function gravarRascunho(input: { empresaId: string; usuarioId: string; id: string | null; dados: DadosRascunho; passo: NumeroPasso }) {
  const db = createAdminClient();
  const agora = new Date().toISOString();
  if (!input.id) {
    const { data, error } = await db.from("invoice_drafts").insert({ organization_id: input.empresaId, step: input.passo, data: input.dados, created_by: input.usuarioId, updated_by: input.usuarioId })
      .select("id").single();
    if (error || !data) throw new Error("Não foi possível salvar o rascunho.");
    return data.id as string;
  }
  const atual = await carregarRascunho(input.empresaId, input.id);
  if (!atual || atual.notaId) throw new Error("Rascunho não encontrado.");
  const { error } = await db.from("invoice_drafts")
    .update({ data: { ...atual.dados, ...input.dados }, step: Math.max(atual.passo, input.passo), updated_by: input.usuarioId, updated_at: agora })
    .eq("organization_id", input.empresaId).eq("id", input.id);
  if (error) throw new Error("Não foi possível salvar o rascunho.");
  return input.id;
}

export type RascunhoLista = { id: string; atualizadoEm: string; competencia: string | null; tomador: { documento: string | null; nome: string } | null; valorCentavos: number | null; passo: NumeroPasso };

export async function listarRascunhos(empresaId: string, limite = 100): Promise<RascunhoLista[]> {
  const { data } = await createAdminClient().from("invoice_drafts").select("id,step,data,idempotency_key,invoice_id,updated_at")
    .eq("organization_id", empresaId).is("invoice_id", null).order("updated_at", { ascending: false }).limit(limite);
  return (data ?? []).map(paraRascunho).map((item) => ({
    id: item.id, atualizadoEm: item.atualizadoEm, competencia: item.dados.competencia ?? null,
    tomador: item.dados.tomador ? { documento: item.dados.tomador.documento, nome: item.dados.tomador.nome } : null,
    valorCentavos: item.dados.valores?.valorCentavos ?? null, passo: item.passo,
  }));
}

export async function excluirRascunho(empresaId: string, id: string) {
  if (!UUID.test(id)) return;
  await createAdminClient().from("invoice_drafts").delete().eq("organization_id", empresaId).eq("id", id).is("invoice_id", null);
}

/** Depois do clique em Emitir: amarra o rascunho à nota (sai da lista) ou, se a Receita rejeitou, troca a chave para poder corrigir e emitir de novo. */
export async function registrarResultado(input: { empresaId: string; id: string; notaId: string; status: string; usuarioId: string }) {
  const db = createAdminClient();
  const { data: nota } = await db.from("invoices").select("id,status").eq("organization_id", input.empresaId).eq("id", input.notaId).maybeSingle();
  if (!nota) return;
  const mudanca = nota.status === "REJECTED"
    ? { idempotency_key: crypto.randomUUID() }
    : { invoice_id: nota.id };
  await db.from("invoice_drafts").update({ ...mudanca, updated_by: input.usuarioId, updated_at: new Date().toISOString() })
    .eq("organization_id", input.empresaId).eq("id", input.id).is("invoice_id", null);
}
