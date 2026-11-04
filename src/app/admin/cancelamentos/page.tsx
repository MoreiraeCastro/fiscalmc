import Link from "next/link";
import { Ban } from "@/components/icons";
import { redirect } from "next/navigation";
import { CancellationReviewActions } from "@/components/cancellation-review-actions";
import { EmptyState, PageHeader, StatusBadge, formatCurrency, formatDateTime } from "@/components/ui-kit";
import { requireOfficeSession } from "@/lib/auth/session";
import { getCancellationStatusPresentation } from "@/lib/operations/queue";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function CancellationsPage() {
  try { await requireOfficeSession(); } catch { redirect("/app?notice=office"); }
  const { data } = await createAdminClient().from("cancellation_requests").select("id,status,reason,created_at,updated_at,invoices(id,nfse_number,amount_cents,customers(legal_name)),organizations(legal_name)").order("updated_at", { ascending: false }).limit(200);
  return <div className="page v2-page"><PageHeader title="Cancelamentos" description="Solicitações que exigem análise do escritório. A transmissão fiscal permanece desabilitada." />
    <section className="v2-panel v2-table-panel"><div className="v2-panel-heading"><div><h2>Fila de cancelamentos</h2><p>Revisar não transmite o cancelamento à SEFIN.</p></div></div>{data?.length ? <div className="v2-table-scroll"><table className="v2-table"><thead><tr><th>Empresa</th><th>NFS-e</th><th>Tomador</th><th>Valor</th><th>Motivo</th><th>Status</th><th>Solicitado em</th><th>Ação</th></tr></thead><tbody>{data.map((item) => { const state = getCancellationStatusPresentation(item.status); const invoice = item.invoices?.[0]; return <tr key={item.id}><td>{item.organizations?.[0]?.legal_name ?? "Empresa"}</td><td>{invoice?.nfse_number ?? "—"}</td><td>{invoice?.customers?.[0]?.legal_name ?? "—"}</td><td>{invoice ? formatCurrency(invoice.amount_cents) : "—"}</td><td className="v2-cell-description">{item.reason}</td><td><StatusBadge tone={state.tone}>{state.label}</StatusBadge></td><td>{formatDateTime(item.created_at)}</td><td><CancellationReviewActions id={item.id} status={item.status} /></td></tr>; })}</tbody></table></div> : <EmptyState title="Nenhuma solicitação de cancelamento" description="Os pedidos enviados por clientes aparecerão aqui." action={<Link className="button secondary" href="/admin/notas"><Ban size={17} />Ver notas</Link>} />}</section>
  </div>;
}
