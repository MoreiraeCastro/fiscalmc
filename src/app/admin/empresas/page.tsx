import Link from "next/link";
import { ArrowUpRight, FilePlus2, Plus, Search } from "@/components/icons";
import { redirect } from "next/navigation";
import { requireOfficeDataClient } from "@/lib/auth/session";
import { EmptyState, PageHeader, StatusBadge, formatTaxId } from "@/components/ui-kit";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; municipality?: string; readiness?: string }> }) {
  const db = await requireOfficeDataClient().catch(() => null);
  if (!db) redirect("/app?notice=office");
  const filters = await searchParams;
  let query = db.from("organizations").select("id,legal_name,tax_id,municipality_code,state,status,emission_blocked").order("legal_name");
  if (filters.q?.trim()) query = query.or(`legal_name.ilike.%${filters.q.trim()}%,tax_id.ilike.%${filters.q.replace(/\D/g, "")}%`);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.municipality?.trim()) query = query.eq("municipality_code", filters.municipality.trim());
  if (filters.readiness === "ready") query = query.eq("emission_blocked", false);
  if (filters.readiness === "pending") query = query.eq("emission_blocked", true);
  const [companiesResult, certificatesResult, accessResult] = await Promise.all([
    query,
    db.from("digital_certificates").select("organization_id,status").is("replaced_at", null),
    db.from("client_accesses").select("organization_id,enabled"),
  ]);
  const companies = companiesResult.data ?? [];
  const certificates = new Map((certificatesResult.data ?? []).map((item) => [item.organization_id, item.status]));
  const accesses = new Map((accessResult.data ?? []).map((item) => [item.organization_id, item.enabled]));

  return <div className="page v2-page">
    <PageHeader title="Empresas" description="Gerencie o cadastro e a prontidão fiscal das organizações atendidas." actions={<Link href="/admin/empresas/nova" className="button primary"><Plus size={18} />Nova empresa</Link>} />
    <form className="v2-filterbar" method="get">
      <label className="v2-search"><Search size={17} aria-hidden /><span className="sr-only">Buscar empresa</span><input name="q" defaultValue={filters.q} placeholder="Buscar por empresa ou CNPJ" /></label>
      <select name="status" defaultValue={filters.status ?? ""} aria-label="Filtrar por status"><option value="">Todos os status</option><option value="ACTIVE">Ativas</option><option value="ONBOARDING">Em onboarding</option><option value="BLOCKED">Bloqueadas</option><option value="INACTIVE">Inativas</option></select>
      <input name="municipality" defaultValue={filters.municipality} placeholder="Código do município" aria-label="Código IBGE do município" />
      <select name="readiness" defaultValue={filters.readiness ?? ""} aria-label="Filtrar por prontidão"><option value="">Toda prontidão</option><option value="ready">Prontas</option><option value="pending">Com pendências</option></select>
      <button className="button secondary" type="submit">Filtrar</button>
    </form>
    <section className="v2-panel v2-table-panel">
      <div className="v2-panel-heading"><div><h2>Organizações</h2><p>{companies.length} resultado(s)</p></div></div>
      {companies.length ? <div className="v2-table-scroll"><table className="v2-table">
        <thead><tr><th>Empresa</th><th>CNPJ</th><th>Município</th><th>Situação</th><th>Certificado</th><th>Acesso</th><th>Ações</th></tr></thead>
        <tbody>{companies.map((company) => <tr key={company.id}>
          <td><Link className="v2-table-primary" href={`/admin/empresas/${company.id}`}>{company.legal_name}</Link></td>
          <td>{formatTaxId(company.tax_id)}</td>
          <td>{company.municipality_code}{company.state ? ` / ${company.state}` : ""}</td>
          <td><StatusBadge tone={company.emission_blocked ? "warning" : "success"}>{company.emission_blocked ? "Requer atenção" : company.status === "ACTIVE" ? "Ativa" : company.status}</StatusBadge></td>
          <td><StatusBadge tone={certificates.get(company.id) === "VALID" ? "success" : certificates.has(company.id) ? "warning" : "neutral"}>{certificates.get(company.id) === "VALID" ? "Válido" : certificates.has(company.id) ? "Revisar" : "Pendente"}</StatusBadge></td>
          <td><StatusBadge tone={accesses.get(company.id) ? "success" : "neutral"}>{accesses.get(company.id) ? "Ativo" : "Pendente"}</StatusBadge></td>
          <td><div className="v2-inline-actions"><Link className="button ghost compact" href={`/admin/empresas/${company.id}`}><ArrowUpRight size={16} />Abrir</Link><Link className="button secondary compact" href={`/admin/empresas/${company.id}?tab=issue`}><FilePlus2 size={16} />Emitir</Link></div></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState title="Nenhuma empresa encontrada" description="Ajuste os filtros ou cadastre uma nova organização." action={<Link href="/admin/empresas/nova" className="button primary"><Plus size={17} />Nova empresa</Link>} />}
    </section>
  </div>;
}
