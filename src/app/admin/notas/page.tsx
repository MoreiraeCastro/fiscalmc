import Link from "next/link";
import { FilePlus2, Search } from "@/components/icons";
import { redirect } from "next/navigation";
import { InvoiceList, type InvoiceRow } from "@/components/invoice-list";
import { PageHeader } from "@/components/ui-kit";
import { requireOfficeDataClient } from "@/lib/auth/session";
import { relationName } from "@/lib/presentation/relations";

export default async function AdminInvoices({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; organization?: string; from?: string; to?: string }> }) {
  const db = await requireOfficeDataClient().catch(() => null);
  if (!db) redirect("/app?notice=office");
  const filters = await searchParams;
  const [{ data: organizations }, invoicesResult] = await Promise.all([
    db.from("organizations").select("id,legal_name").order("legal_name").limit(300),
    db.from("invoices").select("id,dps_number,nfse_number,amount_cents,status,service_date,created_at,updated_at,organizations(legal_name),customers(legal_name),service_templates(name)").order("created_at", { ascending: false }).limit(200),
  ]);
  let data = invoicesResult.data;
  let query = db.from("invoices").select("id,dps_number,nfse_number,amount_cents,status,service_date,created_at,updated_at,organizations(legal_name),customers(legal_name),service_templates(name)").order("created_at", { ascending: false }).limit(200);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.organization) query = query.eq("organization_id", filters.organization);
  if (filters.from) query = query.gte("service_date", filters.from);
  if (filters.to) query = query.lte("service_date", filters.to);
  if (filters.status || filters.organization || filters.from || filters.to) ({ data } = await query);
  let rows: InvoiceRow[] = (data ?? []).map((item) => ({ id: item.id, number: item.nfse_number ?? item.dps_number?.toString() ?? "Em confirmação", amountCents: item.amount_cents, status: item.status, date: item.service_date, createdAt: item.created_at, updatedAt: item.updated_at, company: relationName(item.organizations,"Empresa não disponível"), customer: relationName(item.customers,"Tomador não disponível"), service: relationName(item.service_templates,"Serviço não disponível") }));
  if (filters.q?.trim()) { const needle = filters.q.toLocaleLowerCase("pt-BR"); rows = rows.filter((row) => row.customer.toLocaleLowerCase("pt-BR").includes(needle) || row.company?.toLocaleLowerCase("pt-BR").includes(needle) || row.number.includes(needle)); }
  return <div className="page v2-page"><PageHeader title="Notas" description="Acompanhe as emissões de todas as empresas atendidas." actions={<Link className="button primary" href="/admin/emissoes"><FilePlus2 size={18} />Emitir NFS-e</Link>} />
    <form className="v2-filterbar compact" method="get"><label className="v2-search"><Search size={17} /><span className="sr-only">Buscar nota</span><input name="q" defaultValue={filters.q} placeholder="Buscar número, empresa ou tomador" /></label><select name="organization" defaultValue={filters.organization ?? ""}><option value="">Todas as empresas</option>{(organizations ?? []).map((organization) => <option key={organization.id} value={organization.id}>{organization.legal_name}</option>)}</select><select name="status" defaultValue={filters.status ?? ""}><option value="">Todos os status</option><option value="ISSUED">Emitidas</option><option value="REJECTED">Não emitidas</option><option value="SUBMITTING">Em confirmação</option><option value="UNKNOWN">Verificação necessária</option><option value="CANCELLED">Canceladas</option></select><input aria-label="Período inicial" type="date" name="from" defaultValue={filters.from} /><input aria-label="Período final" type="date" name="to" defaultValue={filters.to} /><button className="button secondary" type="submit">Filtrar</button></form>
    <InvoiceList all admin rows={rows} />
  </div>;
}
