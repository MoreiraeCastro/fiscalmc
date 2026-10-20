import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/auth/session";

/** Empresa escolhida no seletor do topo (o Fiscal emite por várias; o cliente só tem a dele). */
export const COOKIE_EMPRESA = "contribuinte_empresa";

export type EmpresaContribuinte = {
  id: string;
  razaoSocial: string;
  cnpj: string;
  municipio: string;
  uf: string | null;
  email: string | null;
  telefone: string | null;
  emissaoBloqueada: boolean;
  /** O motor só emite com vínculo ativo do usuário nesta empresa (ver requireIssuanceContext). */
  podeEmitir: boolean;
};

export type ContextoContribuinte = {
  usuario: string;
  usuarioId: string;
  escritorio: boolean;
  empresas: EmpresaContribuinte[];
  empresa: EmpresaContribuinte | null;
};

export const contextoContribuinte = cache(async (): Promise<ContextoContribuinte> => {
  const session = await requirePortalSession();
  const escritorio = session.memberships.some((item) => item.role === "SUPER_ADMIN" || item.role === "OFFICE_STAFF");
  // RLS: o escritório enxerga todas as empresas; o cliente, só as dele.
  let query = session.client.from("organizations")
    .select("id,legal_name,tax_id,municipality_code,state,email,phone,emission_blocked")
    .order("legal_name").limit(1000);
  if (!escritorio) query = query.in("id", session.memberships.map((item) => item.organizationId));
  const { data } = await query;
  const vinculos = new Map(session.memberships.map((item) => [item.organizationId, item.role]));
  const empresas: EmpresaContribuinte[] = (data ?? []).map((item) => {
    const papel = vinculos.get(item.id);
    return {
      id: item.id, razaoSocial: item.legal_name, cnpj: item.tax_id, municipio: item.municipality_code, uf: item.state,
      email: item.email, telefone: item.phone, emissaoBloqueada: item.emission_blocked,
      podeEmitir: escritorio ? papel === "SUPER_ADMIN" || papel === "OFFICE_STAFF" : papel === "CLIENT_USER",
    };
  });
  const escolhida = (await cookies()).get(COOKIE_EMPRESA)?.value;
  const empresa = empresas.find((item) => item.id === escolhida) ?? (empresas.length === 1 ? empresas[0] : null);
  return { usuario: session.displayName, usuarioId: session.userId, escritorio, empresas, empresa };
});

/** Para as páginas que dependem de uma empresa: sem empresa escolhida, vai para o seletor. */
export async function exigirEmpresa() {
  const contexto = await contextoContribuinte();
  if (!contexto.empresa) redirect("/contribuinte/empresa");
  return { ...contexto, empresa: contexto.empresa };
}

/** Links que ainda apontam para as telas atuais, até o emissor novo ter a sua versão (passos 2 e 3). */
export function rotasLegadas(escritorio: boolean) {
  return {
    visualizar: (id: string) => (escritorio ? `/admin/notas/${id}` : `/app/notas/${id}`),
    documento: (id: string, tipo: "NFSE_XML" | "PDF") => (escritorio ? `/api/admin/invoices/${id}/artifacts/${tipo}` : `/api/invoices/${id}/artifacts/${tipo}`),
  };
}
