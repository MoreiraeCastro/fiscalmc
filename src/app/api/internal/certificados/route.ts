import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { abrirA1, cadastrarA1 } from "@/lib/certificates/office-import";
import { runEmissionCheck } from "@/lib/operations/emission-check";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const MAX_BYTES = 5 * 1024 * 1024;

function autorizado(recebido: string | null) {
  const esperado = process.env.CERTIFICATE_IMPORT_SECRET;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Server-to-server (tela "Subir certificado" do portal, no mesmo servidor). O portal já conferiu o colaborador;
 * aqui chega o arquivo, a senha digitada por ele e o id do usuário (o login é o mesmo nos dois sistemas).
 */
export async function POST(request: Request) {
  if (!autorizado(request.headers.get("x-internal-secret"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const arquivo = form.get("file");
    const senha = z.string().min(1).max(512).safeParse(form.get("password"));
    const ator = z.string().uuid().safeParse(form.get("actorUserId"));
    if (!senha.success) return NextResponse.json({ error: "Informe a senha do certificado." }, { status: 400 });
    if (!(arquivo instanceof File) || !/\.(pfx|p12)$/i.test(arquivo.name) || !arquivo.size || arquivo.size > MAX_BYTES) return NextResponse.json({ error: "Envie um arquivo .pfx ou .p12." }, { status: 400 });
    const aberto = abrirA1(Buffer.from(await arquivo.arrayBuffer()), [senha.data]);
    if (!aberto) return NextResponse.json({ error: "A senha não abre este certificado." }, { status: 422 });
    if (aberto === "ILEGIVEL") return NextResponse.json({ error: "Não deu para ler este certificado." }, { status: 422 });
    const resultado = await cadastrarA1(aberto, { gravar: true, atorId: ator.success ? ator.data : null });
    const orgId = resultado.organizationId;
    if (orgId && /certificado/.test(resultado.emissor) && !resultado.emissor.startsWith("já")) after(() => runEmissionCheck(orgId, { actorUserId: ator.success ? ator.data : null }).catch(() => undefined));
    logEvent("info", "OFFICE_CERTIFICATE_UPLOAD", { organizationId: orgId ?? null, emissor: resultado.emissor, controle: resultado.controle });
    return NextResponse.json({ resultado });
  } catch (error) {
    logEvent("error", "OFFICE_CERTIFICATE_UPLOAD_FAILED", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Não deu para cadastrar o certificado agora." }, { status: 500 });
  }
}
