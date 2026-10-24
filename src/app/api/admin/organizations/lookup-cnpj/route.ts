import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOfficeSession } from "@/lib/auth/session";
import { normalizeTaxId } from "@/lib/validation/identification";

export const runtime = "nodejs";

const cnaeSchema = z.object({ codigo: z.number(), descricao: z.string() });
const brasilApiSchema = z.object({
  razao_social: z.string().nullable().optional(),
  logradouro: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
  complemento: z.string().nullable().optional(),
  bairro: z.string().nullable().optional(),
  cep: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  codigo_municipio_ibge: z.number().nullable().optional(),
  municipio: z.string().nullable().optional(),
  opcao_pelo_simples: z.boolean().nullable().optional(),
  opcao_pelo_mei: z.boolean().nullable().optional(),
  email: z.string().nullable().optional(),
  ddd_telefone_1: z.string().nullable().optional(),
  descricao_situacao_cadastral: z.string().nullable().optional(),
  cnae_fiscal: z.number().nullable().optional(),
  cnae_fiscal_descricao: z.string().nullable().optional(),
  cnaes_secundarios: z.array(cnaeSchema).nullable().optional(),
});

function formatPhone(raw?: string | null) {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export async function GET(request: Request) {
  try {
    await requireOfficeSession();
  } catch {
    return NextResponse.json({ error: "Acesso do escritório necessário." }, { status: 403 });
  }

  const cnpj = normalizeTaxId(new URL(request.url).searchParams.get("cnpj") ?? "");
  if (!/^\d{14}$/.test(cnpj)) return NextResponse.json({ error: "Informe um CNPJ com 14 dígitos." }, { status: 400 });

  let response: Response;
  try {
    response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; FiscalMC/1.0; +https://fiscalmc.vercel.app)" },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar o CNPJ agora. Tente novamente." }, { status: 502 });
  }
  if (response.status === 404) return NextResponse.json({ error: "CNPJ não encontrado." }, { status: 404 });
  if (!response.ok) return NextResponse.json({ error: "Não foi possível consultar o CNPJ agora. Tente novamente." }, { status: 502 });

  const parsed = brasilApiSchema.safeParse(await response.json());
  if (!parsed.success) return NextResponse.json({ error: "Resposta inesperada da consulta de CNPJ." }, { status: 502 });

  const municipalityCode = parsed.data.codigo_municipio_ibge ? String(parsed.data.codigo_municipio_ibge) : "";
  return NextResponse.json({
    organization: {
      legalName: parsed.data.razao_social ?? "",
      street: parsed.data.logradouro ?? "",
      addressNumber: parsed.data.numero ?? "",
      addressComplement: parsed.data.complemento ?? "",
      neighborhood: parsed.data.bairro ?? "",
      postalCode: (parsed.data.cep ?? "").replace(/\D/g, ""),
      municipalityCode: /^\d{7}$/.test(municipalityCode) ? municipalityCode : "",
      state: parsed.data.uf ?? "",
      municipalityName: parsed.data.municipio ?? "",
      // Só para o resumo do cadastro; o perfil fiscal é criado no servidor com a própria consulta (automatic-tax-profile).
      simples: parsed.data.opcao_pelo_simples ?? null,
      mei: parsed.data.opcao_pelo_mei ?? null,
      email: parsed.data.email ?? "",
      phone: formatPhone(parsed.data.ddd_telefone_1),
      situacaoCadastral: parsed.data.descricao_situacao_cadastral ?? "",
      cnaeFiscalCode: parsed.data.cnae_fiscal ? String(parsed.data.cnae_fiscal).padStart(7, "0") : "",
      cnaeFiscalDescription: parsed.data.cnae_fiscal_descricao ?? "",
      cnaesSecundarios: (parsed.data.cnaes_secundarios ?? []).map((item) => ({ code: String(item.codigo).padStart(7, "0"), description: item.descricao })),
    },
  });
}
