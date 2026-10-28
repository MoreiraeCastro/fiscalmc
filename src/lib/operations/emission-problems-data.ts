import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { problemGuide, resolvedByLaterIssue, sefinText, type ProblemGuide, type ProblemOrigin } from "@/lib/operations/emission-problems";
import { relationName } from "@/lib/presentation/relations";
import { createAdminClient } from "@/lib/supabase/admin";

export type Problem = {
  itemId: string;
  origin: ProblemOrigin;
  at: string;
  organizationId: string;
  company: string;
  customerId: string | null;
  customer: string;
  service: string | null;
  amountCents: number | null;
  code: string | null;
  message: string;
  guide: ProblemGuide;
  invoiceId: string | null;
  invoiceStatus: string | null;
  testEnvironment: boolean;
  state: "pendente" | "resolvida" | "marcada";
};

/**
 * Tudo o que não virou NFS-e desde `since`: recusadas pela Receita, em confirmação e barradas antes do envio
 * (audit_logs "invoice_blocked"). Cada uma vem com o guia do que fazer e se já foi resolvida (emitiu depois ou foi marcada).
 */
export async function loadEmissionProblems(db: SupabaseClient, { since, organizationId }: { since: string; organizationId?: string | undefined }): Promise<Problem[]> {
  const invoiceColumns = "id,organization_id,customer_id,status,rejection_code,safe_status_message,amount_cents,environment,created_at,updated_at,organizations(legal_name),customers(legal_name),service_templates(name)";
  let invoicesQuery = db.from("invoices").select(invoiceColumns).in("status", ["REJECTED", "UNKNOWN"]).gte("updated_at", since).order("updated_at", { ascending: false }).limit(300);
  let blockedQuery = db.from("audit_logs").select("id,organization_id,created_at,safe_metadata,organizations(legal_name)").eq("action", "invoice_blocked").gte("created_at", since).order("created_at", { ascending: false }).limit(300);
  let issuedQuery = db.from("invoices").select("organization_id,customer_id,created_at").eq("status", "ISSUED").gte("created_at", since).limit(2000);
  if (organizationId) {
    invoicesQuery = invoicesQuery.eq("organization_id", organizationId);
    blockedQuery = blockedQuery.eq("organization_id", organizationId);
    issuedQuery = issuedQuery.eq("organization_id", organizationId);
  }
  const [{ data: invoices }, { data: blocked }, { data: issued }, { data: dismissedRows }] = await Promise.all([
    invoicesQuery, blockedQuery, issuedQuery,
    createAdminClient().from("pendency_dismissals").select("item_id"),
  ]);

  // Barradas antes do envio guardam só os ids: busca os nomes de tomador e serviço de uma vez.
  const meta = (row: { safe_metadata: unknown }) => (row.safe_metadata ?? {}) as { code?: string; message?: string; customerId?: string | null; serviceTemplateId?: string | null; amountCents?: number | null };
  const customerIds = [...new Set((blocked ?? []).map((row) => meta(row).customerId).filter((id): id is string => Boolean(id)))];
  const serviceIds = [...new Set((blocked ?? []).map((row) => meta(row).serviceTemplateId).filter((id): id is string => Boolean(id)))];
  const [{ data: customers }, { data: services }] = await Promise.all([
    customerIds.length ? db.from("customers").select("id,legal_name").in("id", customerIds) : Promise.resolve({ data: [] as Array<{ id: string; legal_name: string }> }),
    serviceIds.length ? db.from("service_templates").select("id,name").in("id", serviceIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  const customerName = new Map((customers ?? []).map((c) => [c.id, c.legal_name]));
  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const dismissed = new Set((dismissedRows ?? []).map((row) => row.item_id));
  const issuedList = (issued ?? []).map((row) => ({ organizationId: row.organization_id, customerId: row.customer_id, at: row.created_at }));

  const problems: Problem[] = [];
  for (const invoice of invoices ?? []) {
    const origin: ProblemOrigin = invoice.status === "UNKNOWN" ? "CONFIRMACAO" : "RECEITA";
    const itemId = `invoice-${invoice.id}`;
    const text = sefinText(invoice.safe_status_message, invoice.rejection_code);
    const base = { organizationId: invoice.organization_id, customerId: invoice.customer_id, at: invoice.created_at };
    problems.push({
      itemId, origin, at: invoice.updated_at ?? invoice.created_at, organizationId: invoice.organization_id,
      company: relationName(invoice.organizations, "Empresa"), customerId: invoice.customer_id,
      customer: invoice.customer_id ? relationName(invoice.customers, "Tomador") : "Sem tomador", service: relationName(invoice.service_templates, "") || null,
      amountCents: Number(invoice.amount_cents), code: invoice.rejection_code, guide: problemGuide(invoice.rejection_code, origin),
      message: origin === "CONFIRMACAO" ? "Enviada; aguardando a confirmação da Receita." : text || "Registro antigo: a Receita não teve o motivo guardado. Veja o código.",
      invoiceId: invoice.id, invoiceStatus: invoice.status, testEnvironment: invoice.environment !== "PRODUCTION",
      state: dismissed.has(itemId) ? "marcada" : origin !== "CONFIRMACAO" && resolvedByLaterIssue(base, issuedList) ? "resolvida" : "pendente",
    });
  }
  for (const row of blocked ?? []) {
    const m = meta(row);
    const itemId = `blocked-${row.id}`;
    const base = { organizationId: row.organization_id as string, customerId: m.customerId ?? null, at: row.created_at };
    problems.push({
      itemId, origin: "ANTES_DO_ENVIO", at: row.created_at, organizationId: row.organization_id as string,
      company: relationName(row.organizations, "Empresa"), customerId: m.customerId ?? null,
      customer: m.customerId ? customerName.get(m.customerId) ?? "Tomador" : "—", service: m.serviceTemplateId ? serviceName.get(m.serviceTemplateId) ?? null : null,
      amountCents: m.amountCents ?? null, code: m.code ?? null, guide: problemGuide(m.code, "ANTES_DO_ENVIO"), message: m.message ?? "",
      invoiceId: null, invoiceStatus: null, testEnvironment: false,
      state: dismissed.has(itemId) ? "marcada" : resolvedByLaterIssue(base, issuedList) ? "resolvida" : "pendente",
    });
  }
  return problems.sort((a, b) => b.at.localeCompare(a.at));
}
