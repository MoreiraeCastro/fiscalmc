import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOfficeSession } from "@/lib/auth/session";
import { can } from "@/lib/security/authorization";
import { assertRateLimit } from "@/lib/security/rate-limit";
import { validateA1 } from "@/lib/nfse/certificate/parse";
import { certificateHolderName } from "@/lib/nfse/certificate/presentation";
import { normalizeTaxId } from "@/lib/nfse/certificate/status";

export const runtime = "nodejs";
const maxCertificateBytes = 5 * 1024 * 1024;

/**
 * "Nova empresa": lê o A1 (senha, validade, CNPJ do titular) sem gravar nada, para preencher o CNPJ do cadastro.
 * O certificado só é guardado depois que a empresa existe, pelo POST /api/admin/organizations/{id}/certificate.
 */
export async function POST(request: Request) {
  try {
    const session = await requireOfficeSession();
    if (!can(session.role, "certificate:write")) return NextResponse.json({ error: "Somente superadministradores podem cadastrar certificados." }, { status: 403 });
    try { assertRateLimit(`certificate-inspect:${session.userId}`, 10, 60_000); } catch { return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 }); }
    const form = await request.formData();
    const file = form.get("file");
    const password = z.string().min(1).max(512).safeParse(form.get("password"));
    if (!password.success) return NextResponse.json({ error: "Informe a senha do certificado." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo .pfx ou .p12." }, { status: 400 });
    const extension = file.name.toLowerCase().split(".").pop();
    if (!["pfx", "p12"].includes(extension ?? "") || file.size === 0 || file.size > maxCertificateBytes) return NextResponse.json({ error: "Não foi possível ler este certificado A1." }, { status: 422 });
    const validation = validateA1(Buffer.from(await file.arrayBuffer()), password.data);
    if (validation.status === "INVALID_PASSWORD") return NextResponse.json({ error: "A senha do certificado está incorreta." }, { status: 422 });
    if (validation.status === "EXPIRED") return NextResponse.json({ error: "O certificado está expirado." }, { status: 422 });
    if (validation.status !== "VALID" || !validation.metadata) return NextResponse.json({ error: "Não foi possível ler este certificado A1." }, { status: 422 });
    const taxId = validation.metadata.ownerTaxId ? normalizeTaxId(validation.metadata.ownerTaxId) : null;
    if (!taxId || taxId.length !== 14) return NextResponse.json({ error: "Este certificado não é e-CNPJ (não traz o CNPJ do titular)." }, { status: 422 });
    return NextResponse.json({ certificate: { taxId, holder: certificateHolderName(validation.metadata.subject), validUntil: validation.metadata.validUntil } });
  } catch {
    return NextResponse.json({ error: "Acesso do escritório necessário." }, { status: 403 });
  }
}
