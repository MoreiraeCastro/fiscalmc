import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredNFSeEnvironment } from "@/lib/nfse/environments";
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
  /** Emitida fora do nosso emissor (Emissor Nacional, outro sistema): vem da distribuição do ADN, só leitura. */
  externa: boolean;
};

export const POR_PAGINA = 25;

// Nota sem tomador (Tomador não informado) também aparece: o !inner só entra quando há busca pelo tomador.
const CAMPOS = "id,status,amount_cents,service_date,created_at,issued_at,nfse_number,dps_number,environment,access_key,customers(legal_name,tax_id)";
const CAMPOS_BUSCA = CAMPOS.replace("customers(", "customers!inner(");
const CAMPOS_ADN = "id,access_key,nfse_number,issued_at,generated_at,competence,customer_tax_id,customer_name,amount_cents,cancelled_at";

type Bruta = { id: string; status: string; amount_cents: number; service_date: string; created_at: string; issued_at: string | null; nfse_number: string | null; environment: string; access_key: string | null; customers: Tomador | Tomador[] | null };
type Tomador = { legal_name: string | null; tax_id: string | null };
type BrutaAdn = { id: string; access_key: string; nfse_number: string | null; issued_at: string | null; generated_at: string | null; competence: string | null; customer_tax_id: string | null; customer_name: string | null; amount_cents: number | null; cancelled_at: string | null };

function paraLinha(item: Bruta): NotaLinha {
  const tomador = relationOne(item.customers);
  return {
    id: item.id,
    geracao: item.issued_at ?? item.created_at,
    emitidaPara: { nome: tomador?.legal_name ?? "Não informado", documento: tomador?.tax_id ?? null },
    competencia: item.service_date,
    valorCentavos: item.amount_cents,
    status: item.status,
    numero: item.nfse_number,
    teste: item.environment !== "PRODUCTION",
    externa: false,
  };
}

function externaParaLinha(item: BrutaAdn): NotaLinha {
  return {
    id: item.id,
    geracao: item.issued_at ?? item.generated_at ?? "",
    emitidaPara: { nome: item.customer_name ?? "Não informado", documento: item.customer_tax_id },
    competencia: item.competence ?? "",
    valorCentavos: Number(item.amount_cents ?? 0),
    status: item.cancelled_at ? "CANCELLED" : "ISSUED",
    numero: item.nfse_number,
    teste: false,
    externa: true,
  };
}

/** Tira o que quebraria o filtro do PostgREST (vírgula, parênteses, curingas). */
function termoSeguro(texto: string) {
  return texto.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

async function todasAsPaginas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const saida: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) throw new Error("Não foi possível carregar as notas.");
    saida.push(...(data ?? []));
    if (!data || data.length < 1000) return saida;
  }
}

type Filtro = { empresaId: string; busca?: string; de?: string; ate?: string; competencia?: string };

/** "AAAA-MM" → [primeiro dia do mês, primeiro dia do mês seguinte) para filtrar colunas de data. */
export function intervaloCompetencia(competencia: string): [string, string] {
  const [ano, mes] = competencia.split("-").map(Number);
  const seguinte = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  return [`${competencia}-01`, `${seguinte}-01`];
}

/** As nossas (invoices) e as emitidas fora (ADN, papel PRESTADOR), sem repetir a mesma nota, por competência (a mais recente primeiro) e, dentro dela, pela geração. */
async function todasEmitidas(input: Filtro): Promise<NotaLinha[]> {
  const db = createAdminClient();
  const termo = termoSeguro(input.busca ?? "");
  const digitos = termo.replace(/\D/g, "");
  const nossas = await todasAsPaginas((de, ate) => {
    let query = db.from("invoices").select(termo ? CAMPOS_BUSCA : CAMPOS)
      .eq("organization_id", input.empresaId)
      .not("status", "in", "(DRAFT,READY)")
      .order("created_at", { ascending: false })
      .range(de, ate);
    if (input.de) query = query.gte("created_at", inicioDoDiaBrasilia(input.de));
    if (input.ate) query = query.lt("created_at", inicioDoDiaBrasilia(somarDias(input.ate, 1)));
    if (input.competencia) { const [inicio, fim] = intervaloCompetencia(input.competencia); query = query.gte("service_date", inicio).lt("service_date", fim); }
    if (termo) {
      const filtros = [`legal_name.ilike.*${termo}*`];
      if (digitos.length >= 3) filtros.push(`tax_id.ilike.*${digitos}*`);
      query = query.or(filtros.join(","), { referencedTable: "customers" });
    }
    return query as unknown as PromiseLike<{ data: Bruta[] | null; error: unknown }>;
  });
  // A chave das nossas vem de todas as notas da empresa, não só das filtradas: a nota nossa que ficou fora do filtro
  // também não pode voltar como "externa".
  const chavesNossas = new Set((await todasAsPaginas((de, ate) => db.from("invoices").select("access_key")
    .eq("organization_id", input.empresaId).not("access_key", "is", null).range(de, ate))).map((item) => item.access_key as string));
  const externas = await todasAsPaginas((de, ate) => {
    let query = db.from("received_documents").select(CAMPOS_ADN)
      .eq("organization_id", input.empresaId).eq("environment", getConfiguredNFSeEnvironment())
      .eq("document_type", "NFSE").eq("role", "PRESTADOR")
      .order("issued_at", { ascending: false, nullsFirst: false })
      .range(de, ate);
    if (input.de) query = query.gte("issued_at", inicioDoDiaBrasilia(input.de));
    if (input.ate) query = query.lt("issued_at", inicioDoDiaBrasilia(somarDias(input.ate, 1)));
    if (input.competencia) { const [inicio, fim] = intervaloCompetencia(input.competencia); query = query.gte("competence", inicio).lt("competence", fim); }
    if (termo) {
      const filtros = [`customer_name.ilike.*${termo}*`];
      if (digitos.length >= 3) filtros.push(`customer_tax_id.ilike.*${digitos}*`);
      query = query.or(filtros.join(","));
    }
    return query as unknown as PromiseLike<{ data: BrutaAdn[] | null; error: unknown }>;
  });
  return [
    ...nossas.map(paraLinha),
    ...externas.filter((item) => !chavesNossas.has(item.access_key)).map(externaParaLinha),
  ].sort((a, b) => b.competencia.slice(0, 7).localeCompare(a.competencia.slice(0, 7)) || b.geracao.localeCompare(a.geracao));
}

/**
 * NFS-e Emitidas da empresa: as do nosso emissor e as emitidas fora dele (lidas do ADN). Diferente do portal
 * nacional, sem limite de 30 dias: sem filtro, mostra tudo, da mais nova para a mais antiga. Rascunhos internos
 * (DRAFT/READY) não entram.
 */
export async function listarEmitidas(input: Filtro & { pagina?: number }) {
  const pagina = Math.max(1, input.pagina ?? 1);
  const todas = await todasEmitidas(input);
  return { linhas: todas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA), total: todas.length, pagina };
}

/** Cartão "Últimas NFS-e emitidas nos últimos 30 dias" da Página Principal. */
export async function ultimasEmitidas(empresaId: string, hoje: string) {
  const todas = await todasEmitidas({ empresaId, de: somarDias(hoje, -30) });
  // "Últimas" é pela geração, não pela competência.
  return todas.filter((nota) => nota.externa || ["ISSUED", "CANCELLED", "UNKNOWN", "SUBMITTING"].includes(nota.status))
    .sort((a, b) => b.geracao.localeCompare(a.geracao)).slice(0, 10);
}
