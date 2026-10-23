import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedInternalRequest } from "@/lib/nfse/reconciliation/sweep";
import { sincronizarTodas } from "@/lib/nfse/distribution/sync";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A primeira leitura do histórico de várias empresas passa de alguns segundos.
export const maxDuration = 300;

/**
 * Server-to-server only (systemd timer a cada 2 horas), autenticado pelo mesmo segredo da conciliação.
 * Lê a distribuição do ADN (NFS-e Recebidas) de todas as empresas com A1 válido. Só GET no ADN.
 */
export async function POST(request: Request) {
  if (!isAuthorizedInternalRequest(request.headers.get("x-internal-secret"), process.env.INTERNAL_RECONCILE_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const resultado = await sincronizarTodas(createAdminClient());
    logEvent("info", "RECEIVED_DOCUMENTS_SYNC", resultado);
    return NextResponse.json(resultado);
  } catch (error) {
    logEvent("error", "RECEIVED_DOCUMENTS_SYNC_ROUND_FAILED", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Não foi possível ler as NFS-e recebidas." }, { status: 500 });
  }
}
