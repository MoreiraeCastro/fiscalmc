import { NextResponse } from "next/server";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { recebidaPorId } from "@/lib/contribuinte/recebidas";
import { montarDanfse } from "@/lib/nfse/danfse/modelo";
import { gerarDanfsePdf } from "@/lib/nfse/danfse/pdf";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Download XML / DANFS-e de uma NFS-e recebida. O XML é o que o ADN distribuiu; o PDF é o DANFSe oficial do ADN (com o A1 da empresa). */
export async function GET(_request: Request, context: { params: Promise<{ id: string; tipo: string }> }) {
  const [{ empresa, usuarioId, escritorio }, { id, tipo }] = await Promise.all([exigirEmpresa(), context.params]);
  if (!UUID.test(id) || (tipo !== "xml" && tipo !== "pdf")) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const nota = await recebidaPorId(empresa.id, id);
  if (!nota) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const nome = `nfse-recebida-${nota.nfse_number ?? nota.access_key}`;
  await createAdminClient().from("audit_logs").insert({ organization_id: empresa.id, actor_user_id: usuarioId, actor_type: escritorio ? "OFFICE" : "CLIENT", action: "received_document_downloaded", entity: "received_document", entity_id: nota.id, safe_metadata: { tipo } });
  if (tipo === "xml") {
    return new NextResponse(nota.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}.xml"`, "Cache-Control": "private, no-store" } });
  }
  // A API de DANFSe do ADN foi suspensa em 01/07/2026 (NT 008/2026): o DANFSe sai daqui, do XML distribuído, no leiaute nacional.
  const { data: eventos } = await createAdminClient().from("received_documents").select("event_type").eq("organization_id", empresa.id).eq("access_key", nota.access_key).eq("document_type", "EVENTO");
  const substituida = (eventos ?? []).some((evento) => evento.event_type === "CANCELAMENTO_POR_SUBSTITUICAO");
  const modelo = montarDanfse(nota.xml, { cancelada: Boolean(nota.cancelled_at), substituida });
  if (!modelo) {
    logEvent("warn", "RECEIVED_DANFSE_FAILED", { organizationId: empresa.id, code: "XML_FORA_DO_LEIAUTE" });
    return NextResponse.json({ error: "Não foi possível montar o DANFS-e desta nota. Baixe o XML." }, { status: 422 });
  }
  return new NextResponse(new Uint8Array(await gerarDanfsePdf(modelo)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nome}.pdf"`, "Cache-Control": "private, no-store" } });
}
