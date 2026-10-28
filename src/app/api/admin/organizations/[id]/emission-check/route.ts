import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOfficeSession } from "@/lib/auth/session";
import { can } from "@/lib/security/authorization";
import { runEmissionCheck } from "@/lib/operations/emission-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** "Rodar teste de emissão" da ficha da empresa: o caminho da primeira nota, sem valor fiscal. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOfficeSession();
    if (!can(session.role, "invoice:issue")) return NextResponse.json({ error: "Acesso do escritório necessário." }, { status: 403 });
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    return NextResponse.json(await runEmissionCheck(id, { actorUserId: session.userId }));
  } catch {
    return NextResponse.json({ error: "Não foi possível rodar o teste agora." }, { status: 500 });
  }
}
