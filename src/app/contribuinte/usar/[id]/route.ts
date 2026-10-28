import { NextResponse } from "next/server";
import { appRedirectLocation } from "@/lib/base-path";
import { COOKIE_EMPRESA, contextoContribuinte } from "@/lib/contribuinte/contexto";

/**
 * Atalho "abrir esta empresa no portal": troca a empresa do seletor e vai para `voltar` (só caminhos do portal).
 * Usado pelos links da aba Escritório (notas, emitir) para tudo acontecer dentro do Portal Contribuinte.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const voltar = url.searchParams.get("voltar") ?? "/contribuinte";
  const destino = voltar.startsWith("/contribuinte") && !voltar.startsWith("//") ? voltar : "/contribuinte";
  const { empresas } = await contextoContribuinte();
  if (!empresas.some((item) => item.id === id)) return new NextResponse(null, { status: 307, headers: { Location: appRedirectLocation("/contribuinte/empresa") } });
  const resposta = new NextResponse(null, { status: 307, headers: { Location: appRedirectLocation(destino) } });
  resposta.cookies.set(COOKIE_EMPRESA, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
  return resposta;
}
