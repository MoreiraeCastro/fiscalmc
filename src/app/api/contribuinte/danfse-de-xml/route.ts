import { NextResponse } from "next/server";
import { contextoContribuinte } from "@/lib/contribuinte/contexto";
import { montarDanfse } from "@/lib/nfse/danfse/modelo";
import { gerarDanfsePdf } from "@/lib/nfse/danfse/pdf";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_XML_BYTES = 2 * 1024 * 1024;

/**
 * DANFS-e a partir de um XML de NFS-e qualquer (leiaute nacional), enviado pela tela "XML → DANFS-e". Nada é gravado:
 * o XML entra, o PDF sai. Sem a situação da nota no ADN, o PDF não leva a tarja de cancelada/substituída.
 */
export async function POST(request: Request) {
  const { usuarioId } = await contextoContribuinte();
  const form = await request.formData().catch(() => null);
  const arquivo = form?.get("xml");
  if (!(arquivo instanceof File)) return NextResponse.json({ error: "Envie o arquivo XML." }, { status: 400 });
  if (!arquivo.size) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  if (arquivo.size > MAX_XML_BYTES) return NextResponse.json({ error: "Arquivo grande demais para um XML de NFS-e." }, { status: 413 });

  const xml = new TextDecoder("utf-8").decode(await arquivo.arrayBuffer()).replace(/^﻿/, "");
  const modelo = montarDanfse(xml);
  if (!modelo) {
    logEvent("info", "DANFSE_FROM_XML_REJECTED", { userId: usuarioId });
    return NextResponse.json({ error: "Este arquivo não é o XML de uma NFS-e no padrão nacional (a tag NFSe/infNFSe não foi encontrada)." }, { status: 422 });
  }
  const pdf = await gerarDanfsePdf(modelo);
  logEvent("info", "DANFSE_FROM_XML", { userId: usuarioId });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
}
