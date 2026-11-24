import "server-only";
import { z } from "zod";
import { consultarCnpjPublico } from "@/lib/cnpj/consulta-publica";

const brasilApiSchema = z.object({
  razao_social: z.string().nullable().optional(),
  logradouro: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
  complemento: z.string().nullable().optional(),
  bairro: z.string().nullable().optional(),
  cep: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  codigo_municipio_ibge: z.number().nullable().optional(),
  email: z.string().nullable().optional(),
  ddd_telefone_1: z.string().nullable().optional(),
  descricao_situacao_cadastral: z.string().nullable().optional(),
});

export type CnpjLookupCustomer = { legalName: string; street: string; addressNumber: string; addressComplement: string; neighborhood: string; postalCode: string; municipalityCode: string; state: string; email: string; phone: string; situacaoCadastral: string };
export type CnpjLookupResult = { ok: true; customer: CnpjLookupCustomer } | { ok: false; status: 400 | 404 | 502; error: string };

function formatPhone(raw?: string | null) {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** Public Receita data for a CNPJ via BrasilAPI, com a CNPJá de reserva (shared by the tomador forms). */
export async function lookupCnpj(cnpj: string): Promise<CnpjLookupResult> {
  if (!/^\d{14}$/.test(cnpj)) return { ok: false, status: 400, error: "Informe um CNPJ com 14 dígitos." };
  const consulta = await consultarCnpjPublico(cnpj);
  if (consulta.status === "nao_encontrado") return { ok: false, status: 404, error: "CNPJ não encontrado." };
  if (consulta.status !== "ok") return { ok: false, status: 502, error: "Não foi possível consultar o CNPJ agora. Tente novamente." };
  const parsed = brasilApiSchema.safeParse(consulta.dados);
  if (!parsed.success) return { ok: false, status: 502, error: "Resposta inesperada da consulta de CNPJ." };
  const municipalityCode = parsed.data.codigo_municipio_ibge ? String(parsed.data.codigo_municipio_ibge) : "";
  return {
    ok: true,
    customer: {
      legalName: parsed.data.razao_social ?? "",
      street: parsed.data.logradouro ?? "",
      addressNumber: parsed.data.numero ?? "",
      addressComplement: parsed.data.complemento ?? "",
      neighborhood: parsed.data.bairro ?? "",
      postalCode: (parsed.data.cep ?? "").replace(/\D/g, ""),
      municipalityCode: /^\d{7}$/.test(municipalityCode) ? municipalityCode : "",
      state: parsed.data.uf ?? "",
      email: parsed.data.email ?? "",
      phone: formatPhone(parsed.data.ddd_telefone_1),
      situacaoCadastral: parsed.data.descricao_situacao_cadastral ?? "",
    },
  };
}
