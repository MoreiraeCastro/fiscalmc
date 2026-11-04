import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Search } from "@/components/icons";
import { redirect } from "next/navigation";
import { EmptyState, PageHeader, StatusBadge, formatDateTime } from "@/components/ui-kit";
import { requireOfficeSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ServiceWorkflowStatus } from "@/lib/services/workflow";

type OrganizationRelation = { legal_name: string; municipality_code: string; state: string | null };
type QueueService = {
  id: string; organization_id: string; name: string; default_description: string | null; client_service_location: string | null;
  workflow_status: ServiceWorkflowStatus; submitted_at: string | null; updated_at: string; created_via: "CLIENT" | "OFFICE" | "CATALOG";
  needs_info_message: string | null; national_service_code_id: string | null; municipal_service_mapping_id: string | null;
  organizations: OrganizationRelation | OrganizationRelation[] | null;
};

function organization(service: QueueService) { return Array.isArray(service.organizations) ? service.organizations[0] ?? null : service.organizations; }
function needsReview(service: QueueService) { return !["REVIEWED", "AUTO_READY", "INACTIVE"].includes(service.workflow_status); }
function reviewReason(service: QueueService) {
  if (service.needs_info_message) return "Informações adicionais necessárias";
  if (service.created_via === "CLIENT" && !service.national_service_code_id) return "Serviço informado manualmente";
  if (!service.municipal_service_mapping_id) return "Código municipal não configurado";
  if (!service.national_service_code_id) return "Parâmetros fiscais incompletos";
  return "Não foi possível concluir a configuração automaticamente";
}
function configurationLabel(service: QueueService) {
  if (service.workflow_status === "AUTO_READY") return "Configurado automaticamente";
  if (service.workflow_status === "REVIEWED") return "Configurado pelo escritório";
  return "Inativo";
}

export default async function ServiceValidationPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string }> }) {
  try { await requireOfficeSession(); } catch { redirect("/app?notice=office"); }
  const filters = await searchParams;
  const { data } = await createAdminClient().from("service_templates")
    .select("id,organization_id,name,default_description,client_service_location,workflow_status,submitted_at,updated_at,created_via,needs_info_message,national_service_code_id,municipal_service_mapping_id,organizations(legal_name,municipality_code,state)")
    .order("submitted_at", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false }).limit(500);
  const normalized = (data ?? []) as QueueService[];
  const needle = filters.q?.trim().toLocaleLowerCase("pt-BR");
  const matching = needle ? normalized.filter((service) => `${service.name} ${service.default_description ?? ""} ${organization(service)?.legal_name ?? ""}`.toLocaleLowerCase("pt-BR").includes(needle)) : normalized;
  const review = matching.filter(needsReview);
  const configured = matching.filter((service) => service.workflow_status === "REVIEWED" || service.workflow_status === "AUTO_READY");
  const showReview = filters.view !== "configured";
  const showConfigured = filters.view !== "review";

  return <div className="page v2-page office-services-page">
    <PageHeader title="Serviços" description="Trabalhe somente nas exceções; o que já está configurado continua disponível para emissão." />
    <form className="v2-filterbar compact" method="get">
      <label className="v2-search"><Search size={17} aria-hidden /><span className="sr-only">Buscar serviço ou empresa</span><input name="q" defaultValue={filters.q} placeholder="Buscar serviço ou empresa" /></label>
      <select name="view" defaultValue={filters.view ?? ""} aria-label="Filtrar fila"><option value="">Todos</option><option value="review">Precisa de revisão</option><option value="configured">Configurados</option></select>
      <button className="button secondary" type="submit">Filtrar</button>
    </form>

    {showReview ? <section className="office-section office-review-queue" aria-labelledby="review-heading"><div className="office-section-heading"><div><span className="office-eyebrow">Fila de trabalho</span><h2 id="review-heading">Precisam de revisão</h2><p>Exceções reais que precisam de uma decisão ou informação do escritório.</p></div><strong className="office-section-count">{review.length}</strong></div>{review.length ? <ServiceRows services={review} review /> : <div className="office-day-ok"><span aria-hidden>✓</span><div><strong>Nenhum serviço aguardando revisão</strong><small>Serviços configurados automaticamente não aparecem nesta fila.</small></div></div>}</section> : null}
    {showConfigured ? <section className="office-section office-configured-services" aria-labelledby="configured-heading"><div className="office-section-heading"><div><span className="office-eyebrow">Acompanhamento</span><h2 id="configured-heading">Configurados</h2><p>Serviços prontos ou revisados que não exigem ação agora.</p></div><strong className="office-section-count">{configured.length}</strong></div>{configured.length ? <ServiceRows services={configured} /> : <EmptyState title="Nenhum serviço configurado" description="Os serviços prontos para emissão aparecerão aqui." />}</section> : null}
  </div>;
}

function ServiceRows({ services, review = false }: { services: QueueService[]; review?: boolean }) {
  return <div className="office-service-rows">{services.map((service) => {
    const company = organization(service);
    const href = `/admin/empresas/${service.organization_id}?tab=services&service=${service.id}`;
    return <article key={service.id}><div className="office-service-company"><Link href={href}>{company?.legal_name ?? "Empresa indisponível"}</Link><small>{company?.municipality_code ?? "Município não informado"}{company?.state ? ` / ${company.state}` : ""}</small></div><div className="office-service-name"><strong>{service.name}</strong><small>{service.default_description ?? "Sem descrição comercial."}</small></div>{review ? <div className="office-service-reason"><span>Motivo</span><strong>{reviewReason(service)}</strong></div> : <div className="office-service-reason"><span>Origem/configuração</span><StatusBadge tone={service.workflow_status === "AUTO_READY" ? "info" : "success"}>{configurationLabel(service)}</StatusBadge></div>}<div className="office-service-updated"><span>Atualização</span><strong>{formatDateTime(service.updated_at)}</strong></div><Link className="button ghost compact" href={href}><BriefcaseBusiness size={16} aria-hidden />{review ? "Revisar serviço" : "Abrir"}<ArrowRight size={15} aria-hidden /></Link></article>;
  })}</div>;
}
