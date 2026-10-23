import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredNFSeEnvironment } from "@/lib/nfse/environments";
import { inicioDoDiaBrasilia, somarDias } from "./formato";
import { POR_PAGINA } from "./notas";

export type RecebidaLinha = {
  id: string;
  geracao: string | null;
  emitidaPor: { nome: string | null; documento: string | null };
  competencia: string | null;
  municipioEmissor: string | null;
  valorCentavos: number | null;
  numero: string | null;
  cancelada: boolean;
  papel: "TOMADOR" | "INTERMEDIARIO";
};

const CAMPOS = "id,nfse_number,issued_at,generated_at,competence,issuer_tax_id,issuer_name,issuer_municipality_code,amount_cents,cancelled_at,role";

function termoSeguro(texto: string) {
  return texto.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

type Bruta = { id: string; nfse_number: string | null; issued_at: string | null; generated_at: string | null; competence: string | null; issuer_tax_id: string | null; issuer_name: string | null; issuer_municipality_code: string | null; amount_cents: number | null; cancelled_at: string | null; role: "TOMADOR" | "INTERMEDIARIO" };

/**
 * NFS-e Recebidas: as que a empresa tomou (ou intermediou), lidas da distribuição do ADN.
 * Como as Emitidas, sem o limite de 30 dias do portal nacional: sem filtro, mostra tudo, da mais nova para a mais antiga.
 */
export async function listarRecebidas(input: { empresaId: string; busca?: string; de?: string; ate?: string; pagina?: number }) {
  const pagina = Math.max(1, input.pagina ?? 1);
  const termo = termoSeguro(input.busca ?? "");
  let query = createAdminClient().from("received_documents").select(CAMPOS, { count: "exact" })
    .eq("organization_id", input.empresaId).eq("environment", getConfiguredNFSeEnvironment()).eq("document_type", "NFSE").in("role", ["TOMADOR", "INTERMEDIARIO"])
    .order("issued_at", { ascending: false, nullsFirst: false }).order("nsu", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (input.de) query = query.gte("issued_at", inicioDoDiaBrasilia(input.de));
  if (input.ate) query = query.lt("issued_at", inicioDoDiaBrasilia(somarDias(input.ate, 1)));
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    const filtros = [`issuer_name.ilike.*${termo}*`];
    if (digitos.length >= 3) filtros.push(`issuer_tax_id.ilike.*${digitos}*`);
    query = query.or(filtros.join(","));
  }
  const { data, count, error } = await query;
  if (error) throw new Error("Não foi possível carregar as notas recebidas.");
  const linhas: RecebidaLinha[] = ((data ?? []) as Bruta[]).map((item) => ({
    id: item.id, geracao: item.issued_at ?? item.generated_at, emitidaPor: { nome: item.issuer_name, documento: item.issuer_tax_id },
    competencia: item.competence, municipioEmissor: item.issuer_municipality_code, valorCentavos: item.amount_cents === null ? null : Number(item.amount_cents),
    numero: item.nfse_number, cancelada: Boolean(item.cancelled_at), papel: item.role,
  }));
  return { linhas, total: count ?? 0, pagina };
}

export async function recebidaPorId(empresaId: string, id: string) {
  const { data } = await createAdminClient().from("received_documents").select("id,access_key,nfse_number,role,cancelled_at,xml,generated_at")
    .eq("organization_id", empresaId).eq("id", id).eq("document_type", "NFSE").maybeSingle();
  return data;
}

/** Situação da leitura no ADN para o aviso da tela. */
export async function situacaoLeitura(empresaId: string) {
  const { data } = await createAdminClient().from("received_document_cursors").select("last_sync_at,last_status,last_error,next_allowed_at,locked_until")
    .eq("organization_id", empresaId).eq("environment", getConfiguredNFSeEnvironment()).maybeSingle();
  return data;
}
