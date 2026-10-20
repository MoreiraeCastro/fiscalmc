import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { relationOne } from "@/lib/presentation/relations";
import { inicioDoDiaBrasilia, somarDias } from "./formato";

export type NotaLinha = {
  id: string;
  geracao: string;
  emitidaPara: { nome: string; documento: string | null };
  competencia: string;
  valorCentavos: number;
  status: string;
  numero: string | null;
  teste: boolean;
};

export const POR_PAGINA = 25;

const CAMPOS = "id,status,amount_cents,service_date,created_at,issued_at,nfse_number,dps_number,environment,customers!inner(legal_name,tax_id)";

type Bruta = { id: string; status: string; amount_cents: number; service_date: string; created_at: string; issued_at: string | null; nfse_number: string | null; environment: string; customers: Tomador | Tomador[] | null };
type Tomador = { legal_name: string | null; tax_id: string | null };

function paraLinha(item: Bruta): NotaLinha {
  const tomador = relationOne(item.customers);
  return {
    id: item.id,
    geracao: item.issued_at ?? item.created_at,
    emitidaPara: { nome: tomador?.legal_name ?? "Tomador não informado", documento: tomador?.tax_id ?? null },
    competencia: item.service_date,
    valorCentavos: item.amount_cents,
    status: item.status,
    numero: item.nfse_number,
    teste: item.environment !== "PRODUCTION",
  };
}

/** Tira o que quebraria o filtro do PostgREST (vírgula, parênteses, curingas). */
function termoSeguro(texto: string) {
  return texto.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * NFS-e Emitidas da empresa. Diferente do portal nacional, sem limite de 30 dias: sem filtro, mostra tudo,
 * da mais nova para a mais antiga. Rascunhos internos (DRAFT/READY) não entram.
 */
export async function listarEmitidas(input: { empresaId: string; busca?: string; de?: string; ate?: string; pagina?: number }) {
  const pagina = Math.max(1, input.pagina ?? 1);
  let query = createAdminClient().from("invoices").select(CAMPOS, { count: "exact" })
    .eq("organization_id", input.empresaId)
    .not("status", "in", "(DRAFT,READY)")
    .order("created_at", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (input.de) query = query.gte("created_at", inicioDoDiaBrasilia(input.de));
  if (input.ate) query = query.lt("created_at", inicioDoDiaBrasilia(somarDias(input.ate, 1)));
  const termo = termoSeguro(input.busca ?? "");
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    const filtros = [`legal_name.ilike.*${termo}*`];
    if (digitos.length >= 3) filtros.push(`tax_id.ilike.*${digitos}*`);
    query = query.or(filtros.join(","), { referencedTable: "customers" });
  }
  const { data, count, error } = await query;
  if (error) throw new Error("Não foi possível carregar as notas.");
  return { linhas: (data as Bruta[] | null ?? []).map(paraLinha), total: count ?? 0, pagina };
}

/** Cartão "Últimas NFS-e emitidas nos últimos 30 dias" da Página Principal. */
export async function ultimasEmitidas(empresaId: string, hoje: string) {
  const { data } = await createAdminClient().from("invoices").select(CAMPOS)
    .eq("organization_id", empresaId)
    .in("status", ["ISSUED", "CANCELLED", "UNKNOWN", "SUBMITTING"])
    .gte("created_at", inicioDoDiaBrasilia(somarDias(hoje, -30)))
    .order("created_at", { ascending: false })
    .limit(10);
  return (data as Bruta[] | null ?? []).map(paraLinha);
}
