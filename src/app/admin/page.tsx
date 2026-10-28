import Link from "next/link";
import { ArrowUpRight, Building2, CircleAlert, CircleCheck, FilePlus2, Plus, ScrollText } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader, StatusBadge, formatDateTime } from "@/components/ui-kit";
import { requireOfficeDataClient } from "@/lib/auth/session";
import { getCertificateOperationalState } from "@/lib/operations/queue";
import { loadEmissionProblems } from "@/lib/operations/emission-problems-data";
import { presentAuditActor, presentAuditEvent } from "@/lib/operations/audit-presentation";
import { relationOne } from "@/lib/presentation/relations";

type Company = { id: string; legal_name: string; status: string; emission_blocked: boolean; created_at: string };
type Certificate = { organization_id: string; status: "VALID" | "EXPIRING" | "EXPIRED"; valid_until: string };
type AuditRow = { id: string; action: string; actor_type: string | null; created_at: string; organizations: { legal_name: string } | { legal_name: string }[] | null };

function readiness(company: Company, certificate: Certificate | undefined) {
  if (company.status !== "ACTIVE") return { label: "Em configuração", tone: "neutral" as const };
  if (company.emission_blocked || !certificate || certificate.status === "EXPIRED") return { label: "Bloqueada", tone: "warning" as const };
  if (certificate.status === "EXPIRING") return { label: "Precisa de atenção", tone: "warning" as const };
  return { label: "Pronta para emitir", tone: "success" as const };
}

export default async function AdminPage() {
  const db = await requireOfficeDataClient().catch(() => null);
  if (!db) redirect("/app?notice=office");
  const [companiesResult, certificatesResult, unknownResult, servicesResult, cancellationsResult, auditsResult, problems] = await Promise.all([
    db.from("organizations").select("id,legal_name,status,emission_blocked,created_at").order("created_at", { ascending: false }),
    db.from("digital_certificates").select("organization_id,status,valid_until").is("replaced_at", null),
    db.from("invoices").select("id", { count: "exact", head: true }).eq("status", "UNKNOWN"),
    db.from("service_templates").select("id", { count: "exact", head: true }).in("workflow_status", ["PENDING_REVIEW", "NEEDS_INFO"]),
    db.from("cancellation_requests").select("id", { count: "exact", head: true }).in("status", ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING", "UNKNOWN"]),
    db.from("audit_logs").select("id,action,actor_type,created_at,organizations(legal_name)").order("created_at", { ascending: false }).limit(6),
    loadEmissionProblems(db, { since: new Date(Date.now() - 30 * 864e5).toISOString() }),
  ]);
  const notEmitted = problems.filter((problem) => problem.state === "pendente" && problem.origin !== "CONFIRMACAO").length;
  const companies = (companiesResult.data ?? []) as Company[];
  const certificates = new Map(((certificatesResult.data ?? []) as Certificate[]).map((certificate) => [certificate.organization_id, certificate]));
  const certificateAttention = ((certificatesResult.data ?? []) as Certificate[]).filter((certificate) => getCertificateOperationalState({ status: certificate.status, validUntil: certificate.valid_until }));
  const attentionCount = notEmitted + Number(unknownResult.count ?? 0) + Number(servicesResult.count ?? 0) + Number(cancellationsResult.count ?? 0) + certificateAttention.length + companies.filter((company) => company.emission_blocked || company.status !== "ACTIVE").length;
  const audits = (auditsResult.data ?? []) as AuditRow[];

  return <div className="page v2-page office-dashboard">
    <PageHeader title="Visão geral" description="Acompanhe o que pede atenção e mantenha a operação fiscal em dia." />

    <section className="office-section office-attention" aria-labelledby="attention-heading">
      <div className="office-section-heading"><div><span className="office-eyebrow">Operação</span><h2 id="attention-heading">O que precisa de atenção</h2><p>Somente situações que pedem uma ação do escritório.</p></div><Link className="v2-text-action" href="/admin/pendencias">Ver pendências</Link></div>
      {attentionCount ? <div className="office-action-list">
        {notEmitted ? <OfficeAction href="/admin/nao-emitidas" title={`${notEmitted} nota(s) não emitida(s)`} description="Veja o motivo de cada uma e onde corrigir." /> : null}
        {unknownResult.count ? <OfficeAction href="/admin/notas?status=UNKNOWN" title={`${unknownResult.count} NFS-e aguardando confirmação`} description="Verifique a situação antes de qualquer nova emissão." /> : null}
        {servicesResult.count ? <OfficeAction href="/admin/servicos?status=PENDING_REVIEW" title={`${servicesResult.count} serviço(s) precisam de revisão`} description="Não foi possível concluir a configuração automaticamente." /> : null}
        {certificateAttention.length ? <OfficeAction href="/admin/certificados" title={`${certificateAttention.length} certificado(s) exigem atenção`} description="Confira vencimentos e a validade do certificado A1." /> : null}
        {cancellationsResult.count ? <OfficeAction href="/admin/cancelamentos" title={`${cancellationsResult.count} cancelamento(s) aguardam análise`} description="Continue a análise antes de qualquer nova ação." /> : null}
        {companies.filter((company) => company.emission_blocked || company.status !== "ACTIVE").slice(0, 3).map((company) => <OfficeAction key={company.id} href={`/admin/empresas/${company.id}`} company={company.legal_name} title="Empresa precisa de atenção" description={company.emission_blocked ? "A emissão permanece bloqueada até a configuração estar completa." : "A empresa ainda está em configuração."} />)}
      </div> : <div className="office-day-ok"><CircleCheck size={19} aria-hidden /><div><strong>Operação em dia</strong><small>Não há pendências operacionais abertas neste momento.</small></div></div>}
    </section>

    <section className="office-section" aria-labelledby="readiness-heading">
      <div className="office-section-heading"><div><span className="office-eyebrow">Empresas</span><h2 id="readiness-heading">Prontidão das empresas</h2><p>Uma leitura objetiva do que cada empresa consegue fazer agora.</p></div><Link className="v2-text-action" href="/admin/empresas">Ver empresas</Link></div>
      {companies.length ? <div className="office-readiness-list">{companies.slice(0, 10).map((company) => {
        const state = readiness(company, certificates.get(company.id));
        return <article key={company.id}><div><Link href={`/admin/empresas/${company.id}`}>{company.legal_name}</Link><small>{company.emission_blocked ? "Há uma configuração pendente." : "Dados operacionais acompanhados pelo escritório."}</small></div><div><span>Prontidão</span><StatusBadge tone={state.tone}>{state.label}</StatusBadge></div><div><span>Serviços</span><strong>Ver empresa</strong></div><div><span>Certificado</span><strong>{certificates.has(company.id) ? "Cadastrado" : "Pendente"}</strong></div><Link className="office-row-action" href={`/admin/empresas/${company.id}`}><span>Abrir</span><ArrowUpRight size={16} aria-hidden /></Link></article>;
      })}</div> : <div className="v2-empty"><Building2 size={22} aria-hidden /><strong>Nenhuma empresa cadastrada.</strong></div>}
    </section>

    <div className="office-dashboard-lower">
      <section className="office-section" aria-labelledby="activity-heading"><div className="office-section-heading"><div><span className="office-eyebrow">Acompanhamento</span><h2 id="activity-heading">Atividade recente</h2></div><Link className="v2-text-action" href="/admin/logs">Ver histórico</Link></div>{audits.length ? <ol className="office-activity">{audits.map((audit) => { const event = presentAuditEvent(audit.action); const organization = relationOne(audit.organizations); return <li key={audit.id}><time>{formatDateTime(audit.created_at)}</time><div><strong>{event.label}</strong><small>{organization?.legal_name ?? "Empresa não informada"} · {presentAuditActor(audit.actor_type)}</small></div></li>; })}</ol> : <div className="v2-empty compact"><ScrollText size={20} aria-hidden /><strong>Sem atividade recente.</strong></div>}</section>
      <section className="office-section office-primary-actions" aria-labelledby="actions-heading"><div className="office-section-heading"><div><span className="office-eyebrow">Atalhos</span><h2 id="actions-heading">Ações principais</h2><p>Comece pelas tarefas mais frequentes do escritório.</p></div></div><div><Link href="/admin/emissoes" className="button primary"><FilePlus2 size={18} aria-hidden />Emitir NFS-e</Link><Link href="/admin/empresas/nova" className="button secondary"><Plus size={18} aria-hidden />Nova empresa</Link></div></section>
    </div>
  </div>;
}

function OfficeAction({ href, company, title, description }: { href: string; company?: string; title: string; description: string }) {
  return <Link href={href}><CircleAlert size={18} aria-hidden /><span>{company ? <small>{company}</small> : null}<strong>{title}</strong><em>{description}</em></span><ArrowUpRight size={17} aria-hidden /></Link>;
}
