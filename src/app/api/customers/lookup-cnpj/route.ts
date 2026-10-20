import { NextResponse } from "next/server";
import { requireSessionOrganization } from "@/lib/auth/session";
import { lookupCnpj } from "@/lib/nfse/cnpj-lookup";
import { normalizeTaxId } from "@/lib/validation/identification";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireSessionOrganization();
  } catch {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const result = await lookupCnpj(normalizeTaxId(new URL(request.url).searchParams.get("cnpj") ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ customer: result.customer });
}
