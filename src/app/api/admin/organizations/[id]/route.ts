import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOfficeSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/security/authorization";
import { createClientAccessService } from "@/lib/auth/client-access-service";
import { getOrganizationReadiness } from "@/lib/organizations/readiness";
import { getFiscalConfigurationReadiness, isFiscalProfileAccepted } from "@/lib/nfse/fiscal-configuration";
import { isAdnAutomaticService } from "@/lib/services/automatic-service";
import { getServiceReadiness } from "@/lib/nfse/service-readiness";
import { getCertificateReadiness } from "@/lib/nfse/certificate/status";

const patchSchema = z.object({ action: z.enum(["release", "block", "require_review", "allow_automatic"]) }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOfficeSession();
    if (!can(session.role, "company:write")) return NextResponse.json({ error: "Apenas um administrador pode alterar o bloqueio de emissão." }, { status: 403 });
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    const db = createAdminClient();
    const input = patchSchema.parse(await request.json());

    // Chave "só serviços revisados": ligada, a empresa volta a emitir só com perfil fiscal e serviços revisados pelo escritório.
    if (input.action === "require_review" || input.action === "allow_automatic") {
      const requireOfficeReview = input.action === "require_review";
      const { error } = await db.from("organizations").update({ require_office_review: requireOfficeReview }).eq("id", id);
      if (error) throw error;
      await db.from("audit_logs").insert({ organization_id: id, actor_user_id: session.userId, actor_type: "OFFICE", action: requireOfficeReview ? "office_review_required" : "automatic_emission_allowed", entity: "organization", entity_id: id, safe_metadata: {} });
      return NextResponse.json({ ok: true, requireOfficeReview });
    }

    if (input.action === "block") {
      const { error } = await db.from("organizations").update({ emission_blocked: true }).eq("id", id);
      if (error) throw error;
      await db.from("audit_logs").insert({ organization_id: id, actor_user_id: session.userId, actor_type: "OFFICE", action: "emission_blocked", entity: "organization", entity_id: id, safe_metadata: {} });
      return NextResponse.json({ ok: true, emissionBlocked: true });
    }

    const [{ data: organization }, { data: services }, { data: profile }, { data: certificate }, clientAccess] = await Promise.all([
      db.from("organizations").select("id,status,municipal_registration,street,address_number,neighborhood,state,tax_id,require_office_review").eq("id", id).maybeSingle(),
      db.from("service_templates").select("id,active,workflow_status,national_service_code_id,national_tax_code,municipal_service_code,municipal_service_mapping_id,dps_municipal_tax_code,dps_municipal_tax_code_source,service_location_municipality_code,nbs_code,iss_taxation,iss_rate_source,fiscal_reference,reviewed_at,reviewed_by,auto_ready_source").eq("organization_id", id),
      db.from("tax_profiles").select("tax_regime,reviewed_at,reviewed_by,iss_configuration,dps_configuration,origin").eq("organization_id", id).maybeSingle(),
      db.from("digital_certificates").select("status,owner_tax_id,valid_until").eq("organization_id", id).is("replaced_at", null).maybeSingle(),
      createClientAccessService(db).getSummary(id),
    ]);
    if (!organization) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    const fiscalReadiness = getFiscalConfigurationReadiness(profile);
    const certificateReadiness = getCertificateReadiness({ certificate, organizationTaxId: organization.tax_id });
    const requireOfficeReview = Boolean(organization.require_office_review);
    const readyServices = (services ?? []).filter((service) => getServiceReadiness(service).ready && !(requireOfficeReview && isAdnAutomaticService(service)));
    const organizationReadiness = getOrganizationReadiness({
      registration: { municipalRegistration: organization.municipal_registration, street: organization.street, addressNumber: organization.address_number, neighborhood: organization.neighborhood, state: organization.state },
      fiscal: { ready: isFiscalProfileAccepted(fiscalReadiness.status, requireOfficeReview), message: "" },
      // Sem a exigência de revisão, o passo 2 usa a lista nacional: não precisa de serviço cadastrado antes.
      services: { ready: !requireOfficeReview || readyServices.length > 0, message: "" },
      certificate: { ready: certificateReadiness.ready, message: certificateReadiness.message },
      clientAccess: clientAccess?.readiness ?? { ready: false, message: "Acesso do cliente não cadastrado." },
    });
    if (!organizationReadiness.overallReady) return NextResponse.json({ error: "A empresa ainda tem pendências de prontidão. Resolva-as antes de liberar a emissão.", items: organizationReadiness.items.filter((item) => !item.ready).map((item) => item.key) }, { status: 422 });

    const { error } = await db.from("organizations").update({ emission_blocked: false, ...(organization.status === "ONBOARDING" ? { status: "ACTIVE" } : {}) }).eq("id", id);
    if (error) throw error;
    await db.from("audit_logs").insert({ organization_id: id, actor_user_id: session.userId, actor_type: "OFFICE", action: "emission_unblocked", entity: "organization", entity_id: id, safe_metadata: {} });
    return NextResponse.json({ ok: true, emissionBlocked: false });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ error: "Não foi possível alterar o bloqueio de emissão." }, { status: 422 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOfficeSession();
    if (!can(session.role, "company:write")) return NextResponse.json({ error: "Apenas um administrador pode remover uma empresa." }, { status: 403 });
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    const db = createAdminClient();
    const { data: organization } = await db.from("organizations").select("id,legal_name").eq("id", id).maybeSingle();
    if (!organization) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    const { error } = await db.from("organizations").delete().eq("id", id);
    if (error) {
      // 23503: foreign_key_violation -- invoices reference organizations ON DELETE RESTRICT
      // specifically so a company with real fiscal history (issued or attempted) can never
      // be hard-deleted, even by an admin. This is intentional, not a bug to work around.
      if (error.code === "23503") return NextResponse.json({ error: "Esta empresa já tem notas fiscais (emitidas ou tentadas) e não pode ser removida. Bloqueie a emissão ou desative o acesso em vez de remover." }, { status: 409 });
      throw error;
    }
    await db.from("audit_logs").insert({ organization_id: null, actor_user_id: session.userId, actor_type: "OFFICE", action: "organization_deleted", entity: "organization", entity_id: id, safe_metadata: { legalName: organization.legal_name } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível remover a empresa." }, { status: 422 });
  }
}
