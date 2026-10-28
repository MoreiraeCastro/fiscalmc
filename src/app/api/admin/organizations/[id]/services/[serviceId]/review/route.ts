import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireOfficeSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEmissionCheck } from "@/lib/operations/emission-check";
import { getServiceTechnicalReadiness } from "@/lib/nfse/service-readiness";
import { buildOfficeServiceApproval, buildServiceInformationRequest, canOfficeApproveService } from "@/lib/services/workflow";

export const runtime = "nodejs";

const reviewActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }).strict(),
  z.object({ action: z.literal("request-info"), message: z.string().trim().min(10).max(500) }).strict(),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string; serviceId: string }> }) {
  try {
    const session = await requireOfficeSession();
    const input = reviewActionSchema.parse(await request.json());
    const { id: organizationId, serviceId } = await params;
    const db = createAdminClient();
    const { data: service } = await db.from("service_templates").select("id,active,created_via,workflow_status,submitted_at,national_service_code_id,national_tax_code,municipal_service_code,municipal_service_mapping_id,dps_municipal_tax_code,dps_municipal_tax_code_source,service_location_municipality_code,nbs_code,iss_taxation,iss_rate_source,fiscal_reference,reviewed_at,reviewed_by").eq("id", serviceId).eq("organization_id", organizationId).maybeSingle();
    if (!service) return NextResponse.json({ error: "Serviço indisponível para esta empresa." }, { status: 404 });
    const now = new Date().toISOString();
    if (input.action === "request-info") {
      if (service.workflow_status !== "PENDING_REVIEW") return NextResponse.json({ error: "Este serviço não está aguardando análise." }, { status: 422 });
      const transition = buildServiceInformationRequest(service.workflow_status, input.message, service.submitted_at, now);
      const { error } = await db.from("service_templates").update({
        ...transition,
        updated_at: now,
      }).eq("id", serviceId).eq("organization_id", organizationId);
      if (error) throw error;
      await db.from("audit_logs").insert({ organization_id: organizationId, actor_user_id: session.userId, actor_type: "OFFICE", action: "service_information_requested", entity: "service_template", entity_id: serviceId, safe_metadata: {} });
      return NextResponse.json({ ok: true, workflowStatus: "NEEDS_INFO", message: input.message });
    }
    const approvalAllowed = canOfficeApproveService(service.workflow_status, service.created_via);
    if (!approvalAllowed) return NextResponse.json({ error: service.created_via === "CLIENT" ? "O cliente precisa enviar o serviço para análise antes da aprovação." : "Este serviço não está em um estado disponível para aprovação." }, { status: 422 });
    const readiness = getServiceTechnicalReadiness(service);
    if (!readiness.ready) return NextResponse.json({ error: "Conclua os campos fiscais pendentes antes de aprovar.", missing: readiness.missing }, { status: 422 });
    const approval = buildOfficeServiceApproval(service.workflow_status, service.created_via, now, session.userId);
    const { error } = await db.from("service_templates").update({ ...approval, updated_at: now }).eq("id", serviceId).eq("organization_id", organizationId);
    if (error) throw error;
    await db.from("audit_logs").insert({ organization_id: organizationId, actor_user_id: session.userId, actor_type: "OFFICE", action: "service_reviewed", entity: "service_template", entity_id: serviceId, safe_metadata: {} });
    after(() => runEmissionCheck(organizationId, { actorUserId: session.userId }).catch(() => undefined));
    return NextResponse.json({ ok: true, workflowStatus: "REVIEWED", reviewedAt: now, reviewedBy: session.displayName });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Informe uma ação de revisão válida." : "Não foi possível concluir a análise do serviço." }, { status: 422 });
  }
}
