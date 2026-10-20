"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_EMPRESA, contextoContribuinte } from "@/lib/contribuinte/contexto";

export async function escolherEmpresa(formData: FormData) {
  const id = String(formData.get("empresa") ?? "");
  const { empresas } = await contextoContribuinte();
  if (!empresas.some((item) => item.id === id)) redirect("/contribuinte/empresa");
  (await cookies()).set(COOKIE_EMPRESA, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
  const voltar = String(formData.get("voltar") ?? "");
  redirect(voltar.startsWith("/contribuinte") && !voltar.startsWith("/contribuinte/empresa") ? voltar : "/contribuinte");
}
