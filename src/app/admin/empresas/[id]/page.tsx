import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, FilePlus2, Pencil, ShieldAlert } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ServiceManager, type ManagedService } from "@/components/service-manager";
import { FiscalConfigurationForm } from "@/components/fiscal-configuration-form";
import { CertificateManager } from "@/components/certificate-manager";
import { ClientAccessManager } from "@/components/client-access-manager";
import { MunicipalRegistrationForm } from "@/components/municipal-registration-form";
import { DeleteOrganizationButton } from "@/components/delete-organization-button";
import { EmissionBlockToggle } from "@/components/emission-block-toggle";
import { EmissionPreflight } from "@/components/emission-preflight";
import { IssueForm, type IssueCustomer, type IssueService } from "@/components/issue-form";
import { StatusBadge, formatDate, formatTaxId } from "@/components/ui-kit";
import { requireOfficeDataClient, requireOfficeSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFiscalConfigurationReadiness } from "@/lib/nfse/fiscal-configuration";
import { getServiceReadiness } from "@/lib/nfse/service-readiness";
import { getCertificateReadiness } from "@/lib/nfse/certificate/status";
import { createClientAccessService } from "@/lib/auth/client-access-service";
import { getOrganizationReadiness, type ReadinessItemKey } from "@/lib/organizations/readiness";
import { can } from "@/lib/security/authorization";

const tabs = [["overview", "Visão geral"], ["issue", "Emitir NFS-e"], ["fiscal", "Dados fiscais"], ["services", "Serviços"], ["certificate", "Certificado"], ["users", "Usuários"], ["invoices", "Notas"], ["logs", "Logs"]] as const;
type CompanyTab = (typeof tabs)[number][0];
const readinessTabs: Record<ReadinessItemKey, CompanyTab> = { registration: "overview", fiscal: "fiscal", services: "services", certificate: "certificate", clientAccess: "users" };
const readinessLabels: Record<ReadinessItemKey, string> = { registration: "Cadastro", fiscal: "Fiscal", services: "Serviços", certificate: "Certificado", clientAccess: "Acesso" };

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; service?: string }> }) {
  let officeSession;
  try { officeSession = await requireOfficeSession(); } catch { redirect("/app?notice=office"); }
  const [{ id }, { tab: requested, service: selectedServiceId }] = await Promise.all([params, searchParams]);
  if (requested === "issue") redirect(`/contribuinte/usar/${id}?voltar=${encodeURIComponent("/contribuinte/nova")}`);
  const tab: CompanyTab = tabs.some(([key]) => key === requested) ? requested as CompanyTab : "overview";
  const isOverview = tab === "overview";
  const needsServices = isOverview || tab === "services" || tab === "issue";
  const needsFiscal = isOverview || tab === "fiscal";
  const needsCertificate = isOverview || tab === "certificate";
  const needsAccess = isOverview || tab === "users";
  const db = await requireOfficeDataClient().catch(() => null);
  if (!db) redirect("/app?notice=office");
  const canReadCertificate = can(officeSession.role, "certificate:read");
  const canManageCertificate = can(officeSession.role, "certificate:write");
  const canReadClientAccess = can(officeSession.role, "client-access:read");
  const canManageClientAccess = can(officeSession.role, "client-access:write");
  const canRunEmissionPreflight = can(officeSession.role, "invoice:issue");
  const canDeleteCompany = can(officeSession.role, "company:write");
  const [companyResult, servicesResult, taxProfileResult, catalogResult, customersResult, certificateResult, clientAccessResult, lastInvoiceResult] = await Promise.all([
    db.from("organizations").select("id,legal_name,trade_name,tax_id,municipality_code,status,emission_blocked,municipal_registration,street,address_number,address_complement,neighborhood,state,postal_code,email,phone").eq("id", id).maybeSingle(),
    needsServices ? createAdminClient().from("service_templates").select("id,name,default_description,active,workflow_status,created_via,client_service_location,client_note,needs_info_message,submitted_at,review_note,updated_at,national_service_code_id,national_tax_code,municipal_service_code,municipal_service_mapping_id,dps_municipal_tax_code,dps_municipal_tax_code_source,service_location_municipality_code,nbs_code,iss_taxation,iss_rate_source,fiscal_reference,reviewed_at,reviewed_by,national_service_codes(display_code,description)").eq("organization_id", id).order("updated_at", { ascending: false }) : Promise.resolve({ data: [] }),
    needsFiscal ? db.from("tax_profiles").select("tax_regime,dps_configuration,reviewed_at,reviewed_by").eq("organization_id", id).maybeSingle() : Promise.resolve({ data: null }),
    tab === "services" ? db.from("national_service_codes").select("id", { count: "exact", head: true }) : Promise.resolve({ count: 0 }),
    tab === "issue" || isOverview ? db.from("customers").select("id,legal_name,tax_id").eq("organization_id", id).order("legal_name") : Promise.resolve({ data: [] }),
    needsCertificate && canReadCertificate ? db.from("digital_certificates").select("id,subject,issuer,serial,owner_tax_id,valid_from,valid_until,status,created_at").eq("organization_id", id).is("replaced_at", null).maybeSingle() : Promise.resolve({ data: null }),
    needsAccess && canReadClientAccess ? createClientAccessService(createAdminClient()).getSummary(id) : Promise.resolve(null),
    isOverview ? db.from("invoices").select("service_date,status").eq("organization_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const company = companyResult.data;
  if (!company) notFound();
  const services = servicesResult.data ?? [];
  const fiscalReadiness = getFiscalConfigurationReadiness(taxProfileResult.data);
  const certificateReadiness = getCertificateReadiness({ certificate: certificateResult.data, organizationTaxId: company.tax_id });
  const serviceDtos = services.map((item) => ({ ...item, national_service_codes: item.national_service_codes?.[0] ?? null })) as ManagedService[];
  const readyServices = serviceDtos.filter((service) => getServiceReadiness(service).ready);
  const organizationReadiness = getOrganizationReadiness({
    registration: { municipalRegistration: company.municipal_registration, street: company.street, addressNumber: company.address_number, neighborhood: company.neighborhood, state: company.state },
    fiscal: { ready: fiscalReadiness.status === "REVIEWED", message: fiscalReadiness.status === "REVIEWED" ? "Configuração fiscal revisada." : "Configuração fiscal requer revisão." },
    services: { ready: readyServices.length > 0, message: readyServices.length > 0 ? `${readyServices.length} serviço(s) apto(s).` : "Nenhum serviço ativo e revisado." },
    certificate: { ready: certificateReadiness.ready, message: certificateReadiness.message, warning: certificateReadiness.warning ? certificateReadiness.message : undefined },
    clientAccess: clientAccessResult?.readiness ?? { ready: false, message: "Acesso do cliente não cadastrado." },
  });
  const issueCustomers: IssueCustomer[] = (customersResult.data ?? []).map((item) => ({ id: item.id, legalName: item.legal_name, taxId: item.tax_id }));
  const issueServices: IssueService[] = readyServices.map((item) => ({ id: item.id, name: item.name, defaultDescription: item.default_description, requiresManualIssRate: item.iss_taxation !== "3" && item.iss_taxation !== "4" && item.iss_rate_source !== "PARAMETRIZED_BY_NATIONAL" && !item.municipal_service_mapping_id }));
  const pendingItems = organizationReadiness.items.filter((item) => !item.ready || item.warning);

  return <div className="page v2-page company-detail-page">
    <header className="v2-company-header">
      <div><Link className="v2-back-link" href="/admin/empresas">← Empresas</Link><h1>{company.legal_name}</h1><p>{formatTaxId(company.tax_id)}<span>•</span>{company.municipality_code}{company.state ? ` / ${company.state}` : ""}<span>•</span><StatusBadge tone={company.emission_blocked ? "warning" : "success"}>{company.emission_blocked ? "Emissão bloqueada" : company.status}</StatusBadge></p></div>
      <div className="v2-page-actions">{canDeleteCompany && company.emission_blocked ? <EmissionBlockToggle organizationId={id} blocked={company.emission_blocked} readinessComplete={organizationReadiness.overallReady} /> : null}<Link className="button primary" href={`/admin/empresas/${id}?tab=issue`}><FilePlus2 size={18} />Emitir NFS-e</Link><Link className="button secondary" href={`/admin/empresas/${id}?tab=overview`}><Pencil size={17} />Ver cadastro</Link>{canDeleteCompany ? <DeleteOrganizationButton organizationId={id} organizationName={company.legal_name} /> : null}</div>
    </header>
    <nav className="tabs v2-tabs" aria-label="Seções da empresa">{tabs.map(([key, label]) => <Link className={tab === key ? "active" : ""} href={`/admin/empresas/${id}?tab=${key}`} key={key}>{label}</Link>)}</nav>

    {tab === "overview" ? <div className="v2-company-overview">
      <div><section className="v2-panel v2-readiness-panel">
        <div className="v2-panel-heading"><div><h2>Prontidão para emissão</h2><p>Requisitos administrativos e fiscais desta empresa.</p></div><StatusBadge tone={organizationReadiness.overallReady ? "success" : "warning"}>{organizationReadiness.overallReady ? "Completa" : `${pendingItems.length} pendência(s)`}</StatusBadge></div>
        <div className="v2-readiness-list">{organizationReadiness.items.map((item) => <div key={item.key} className={item.ready ? "is-ready" : "is-pending"}>
          <span className="v2-readiness-icon">{item.ready ? <Check size={18} /> : <AlertTriangle size={17} />}</span>
          <span><strong>{readinessLabels[item.key]}</strong><small>{item.warning ?? item.message}</small></span>
          <StatusBadge tone={item.ready ? item.warning ? "warning" : "success" : "warning"}>{item.ready ? item.warning ? "Atenção" : "Concluído" : "Pendente"}</StatusBadge>
          <Link href={`/admin/empresas/${id}?tab=${readinessTabs[item.key]}`}>{item.ready ? "Revisar" : "Resolver"}<ArrowRight size={15} /></Link>
        </div>)}</div>
        <MunicipalRegistrationForm organizationId={company.id} initialValue={company.municipal_registration} />
      </section></div>
      <aside className="v2-company-aside">
        <section className="v2-panel"><div className="v2-panel-heading"><div><h2>Resumo da empresa</h2></div></div><dl className="v2-definition-list">
          <div><dt>Regime</dt><dd>{taxProfileResult.data?.tax_regime?.replaceAll("_", " ") ?? "Pendente"}</dd></div>
          <div><dt>Serviços aptos</dt><dd>{readyServices.length}</dd></div>
          <div><dt>Certificado</dt><dd>{certificateReadiness.message}</dd></div>
          <div><dt>Acesso do cliente</dt><dd>{clientAccessResult?.readiness.message ?? "Não cadastrado"}</dd></div>
          <div><dt>Última emissão</dt><dd>{formatDate(lastInvoiceResult.data?.service_date)}</dd></div>
        </dl></section>
        {pendingItems.length ? <section className="v2-panel v2-company-pending"><div className="v2-panel-heading"><div><h2>Pendências</h2></div><ShieldAlert size={20} /></div>{pendingItems.map((item) => <Link href={`/admin/empresas/${id}?tab=${readinessTabs[item.key]}`} key={item.key}><span>{readinessLabels[item.key]}</span><ArrowRight size={15} /></Link>)}</section> : null}
      </aside>
    </div> : null}
    {tab === "issue" ? <section className="v2-issue-admin"><EmissionPreflight organizationId={company.id} canRun={canRunEmissionPreflight} services={issueServices} /><IssueForm customers={issueCustomers} services={issueServices} issuanceOrganizationId={company.id} catalogEnabled requiresProductionConfirmation={process.env.NFSE_ENV?.toLowerCase() === "production"} /></section> : null}
    {tab === "services" ? <ServiceManager organizationId={company.id} municipalityCode={company.municipality_code} initialServices={serviceDtos} catalogAvailable={Boolean(catalogResult.count)} initialSelectedServiceId={selectedServiceId ?? null} /> : null}
    {tab === "fiscal" ? <FiscalConfigurationForm organizationId={company.id} initialConfiguration={fiscalReadiness} /> : null}
    {tab === "certificate" ? canReadCertificate ? <CertificateManager organizationId={company.id} organizationTaxId={company.tax_id} initialCertificate={certificateResult.data} canWrite={canManageCertificate} /> : <Notice title="Certificado" text="Seu perfil não pode consultar certificados." /> : null}
    {tab === "users" ? canReadClientAccess && clientAccessResult ? <ClientAccessManager organizationId={company.id} organizationTaxId={company.tax_id} initial={clientAccessResult} canWrite={canManageClientAccess} /> : <Notice title="Acessos" text="Seu perfil não pode consultar acessos de clientes." /> : null}
    {tab === "invoices" ? <Notice title="Notas fiscais" text="Consulte as emissões reais pela área de notas." action={<Link className="button secondary" href="/admin/notas">Abrir notas</Link>} /> : null}
    {tab === "logs" ? <Notice title="Logs" text="Consulte os eventos técnicos seguros desta operação." action={<Link className="button secondary" href="/admin/logs">Abrir logs</Link>} /> : null}
  </div>;
}

function Notice({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <section className="v2-empty v2-panel"><strong>{title}</strong><p>{text}</p>{action}</section>;
}
