import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/nfse/certificate/encryption";
import { validateA1, type CertificateMetadata } from "@/lib/nfse/certificate/parse";
import { classifyCertificate } from "@/lib/nfse/certificate/status";
import { certificateHolderName } from "@/lib/nfse/certificate/presentation";
import { ensureAutomaticTaxProfile } from "@/lib/organizations/automatic-tax-profile";
import { resolveCnaeActivity } from "@/lib/organizations/cnae-activity-resolver";
import { createServiceFromNationalCode } from "@/lib/services/catalog-linking";
import { logEvent } from "@/lib/observability/logger";

/**
 * Cadastro de A1 pelo escritório (tela "Subir certificado" do portal e importação em lote):
 * emissor (cofre + empresa nova quando falta) e controle de certificados (vencimento), num passo só.
 * A senha só é usada para abrir o arquivo e vai cifrada para o cofre; nunca para log ou resposta.
 */

export type A1Aberto = { buffer: Buffer; senha: string; meta: CertificateMetadata; vencido: boolean };
export type ResultadoA1 = { documento: string; titular: string; validade: string; emissor: string; controle: string; organizationId?: string; empresaNova?: boolean };

// Dia civil em Brasília (AAAA-MM-DD): um A1 que vence depois das 21h cai no dia seguinte em UTC.
const fusoBrasilia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
export const dia = (iso: string) => fusoBrasilia.format(new Date(iso));
/** Mesmo vencimento no controle com folga de um dia (a planilha antiga às vezes anotou o dia seguinte; o controle já tem dias gravados em UTC). */
export const mesmoDia = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 86_400_000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tenta as senhas na ordem. null = nenhuma abriu; "ILEGIVEL" = abriu mas não é um A1 legível. */
export function abrirA1(buffer: Buffer, senhas: string[]): A1Aberto | "ILEGIVEL" | null {
  for (const senha of senhas) {
    const v = validateA1(buffer, senha);
    if (v.status === "INVALID_PASSWORD") continue;
    if (!v.metadata) return "ILEGIVEL";
    return { buffer, senha, meta: v.metadata, vencido: v.status !== "VALID" };
  }
  return null;
}

/** CNPJ do titular, ou o CPF do e-CPF (fim do CN "NOME:CPF"). */
export function documentoDoA1(meta: CertificateMetadata) {
  if (meta.ownerTaxId) return meta.ownerTaxId;
  const m = meta.subject.match(/:(\d{11})(?:,|$)/);
  return m ? m[1] : null;
}

function clienteDoControle(): SupabaseClient | null {
  const url = process.env.CONTROLE_SUPABASE_URL;
  const key = process.env.CONTROLE_SUPABASE_SECRET_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

async function consultaCnpj(cnpj: string) {
  for (let t = 0; t < 4; t++) {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; FiscalMC/1.0)" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (r?.ok) return (await r.json()) as Record<string, unknown>;
    if (r?.status === 404) return null;
    await dormir(5_000 * (t + 1));
  }
  return null;
}

/** Empresa nova no emissor com os dados públicos do CNPJ, liberada, com perfil fiscal automático (quando a Receita informa o regime). */
async function criarEmpresa(db: SupabaseClient, cnpj: string, atorId: string | null): Promise<string | { erro: string }> {
  const c = await consultaCnpj(cnpj);
  const municipio = c?.codigo_municipio_ibge ? String(c.codigo_municipio_ibge) : "";
  if (!c || !/^\d{7}$/.test(municipio)) return { erro: "a consulta do CNPJ não respondeu" };
  const cnae = c.cnae_fiscal ? String(c.cnae_fiscal).padStart(7, "0") : null;
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const { data, error } = await db.from("organizations").insert({
    legal_name: txt(c.razao_social) ?? cnpj, trade_name: txt(c.nome_fantasia), tax_id: cnpj, municipality_code: municipio,
    postal_code: txt(String(c.cep ?? "").replace(/\D/g, "")), street: txt(c.logradouro), address_number: txt(c.numero), address_complement: txt(c.complemento),
    neighborhood: txt(c.bairro), state: txt(c.uf), email: txt(c.email), cnae_fiscal_code: cnae, cnae_fiscal_description: txt(c.cnae_fiscal_descricao),
    cnaes_secundarios: Array.isArray(c.cnaes_secundarios) ? (c.cnaes_secundarios as { codigo: number; descricao: string }[]).map((i) => ({ code: String(i.codigo).padStart(7, "0"), description: i.descricao })) : [],
    status: "ACTIVE", emission_blocked: false,
  }).select("id").single();
  if (error) return { erro: "não deu para criar a empresa" };
  if (cnae && atorId) {
    try {
      const r = await resolveCnaeActivity(db, cnae);
      if (r.candidates.length === 1) await createServiceFromNationalCode({ db, organizationId: data.id, nationalServiceCodeId: r.candidates[0].nationalServiceCodeId, createdBy: atorId, actorType: "OFFICE", allowAutoReady: true });
    } catch { /* o cadastro não depende do serviço */ }
  }
  await ensureAutomaticTaxProfile(db, data.id);
  return data.id;
}

async function noEmissor(db: SupabaseClient, a: A1Aberto, gravar: boolean, atorId: string | null): Promise<Pick<ResultadoA1, "emissor" | "organizationId" | "empresaNova">> {
  const cnpj = a.meta.ownerTaxId;
  if (!cnpj) return { emissor: "e-CPF (o emissor só usa e-CNPJ)" };
  if (a.vencido) return { emissor: "vencido" };
  const { data: org } = await db.from("organizations").select("id").eq("tax_id", cnpj).maybeSingle();
  let orgId = org?.id as string | undefined;
  if (orgId) {
    const { data: cert } = await db.from("digital_certificates").select("valid_until,fingerprint_sha256").eq("organization_id", orgId).is("replaced_at", null).maybeSingle();
    // O banco devolve "+00:00" e o arquivo ".000Z": compara como data, e o mesmo arquivo (fingerprint) nunca conta como renovação.
    if (cert && (cert.fingerprint_sha256 === a.meta.fingerprintSha256 || Date.parse(cert.valid_until) >= Date.parse(a.meta.validUntil))) return { emissor: "já tinha (igual ou mais novo)", organizationId: orgId };
  } else {
    if (!gravar) return { emissor: "empresa nova + certificado" };
    const r = await criarEmpresa(db, cnpj, atorId);
    if (typeof r !== "string") return { emissor: `FALHA: ${r.erro}` };
    orgId = r;
  }
  if (!gravar) return { emissor: "certificado novo/renovado", organizationId: orgId };
  const storagePath = `organizations/${orgId}/certificates/${crypto.randomUUID()}.p12`;
  const up = await db.storage.from("a1-certificates").upload(storagePath, a.buffer, { contentType: "application/x-pkcs12", upsert: false });
  if (up.error) return { emissor: "FALHA: armazenamento", organizationId: orgId };
  const status = classifyCertificate(a.meta);
  const { data: id, error } = await db.rpc("register_organization_certificate", {
    p_organization_id: orgId, p_storage_path: storagePath, p_encrypted_password: encryptSecret(Buffer.from(a.senha, "utf8")),
    p_serial: a.meta.serial, p_subject: a.meta.subject, p_issuer: a.meta.issuer, p_valid_from: a.meta.validFrom, p_valid_until: a.meta.validUntil,
    p_status: status, p_owner_tax_id: a.meta.ownerTaxId, p_fingerprint_sha256: a.meta.fingerprintSha256,
  });
  if (error || !id) { await db.storage.from("a1-certificates").remove([storagePath]); return { emissor: "FALHA: registro", organizationId: orgId }; }
  await db.from("audit_logs").insert({ organization_id: orgId, actor_user_id: atorId, actor_type: "OFFICE", action: org ? "certificate_replaced" : "certificate_added", entity: "digital_certificate", entity_id: id, safe_metadata: { status, origem: "portal" } });
  return { emissor: org ? "certificado novo/renovado" : "empresa nova + certificado", organizationId: orgId, empresaNova: !org };
}

/** Código da empresa na base principal (core.companies, mesmo projeto) quando o chamador não informa. */
async function codigoDaBase(documento: string) {
  const { data } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false }, db: { schema: "core" } })
    .from("companies").select("code").eq("document", documento).not("code", "is", null).limit(1).maybeSingle();
  return (data?.code as string | undefined) ?? null;
}

const codigoDoControle = (emp: { code?: string | null } | null) => emp?.code ?? "";

/** Arquivo do A1 como anexo do certificado no controle (bucket privado certificado-anexos). Sem a senha. Falha aqui não desfaz o cadastro. */
async function anexarNoControle(controle: SupabaseClient, companyId: string, certificateId: string, codigo: string, buffer: Buffer, validade: string) {
  try {
    const nome = `${codigo ? `${codigo} - ` : ""}A1 ${validade}.pfx`;
    const path = `${companyId}/${certificateId}/${Date.now()}-${nome.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const up = await controle.storage.from("certificado-anexos").upload(path, buffer, { contentType: "application/x-pkcs12" });
    if (up.error) return;
    await controle.from("certificates").update({ attachment_path: path, attachment_name: nome, attachment_size: buffer.length, attachment_uploaded_at: new Date().toISOString() }).eq("id", certificateId);
  } catch { /* o anexo é complemento */ }
}

async function noControle(a: A1Aberto, documento: string, codigo: string | null, gravar: boolean): Promise<string> {
  const controle = clienteDoControle();
  if (!controle) return "FALHA: controle de certificados não configurado";
  let { data: emp } = await controle.from("companies").select("id,code").eq("document", documento).maybeSingle();
  if (!emp) {
    const cod = (codigo ?? (await codigoDaBase(documento)))?.replace(/^0+/, "") || null;
    if (!cod) return "empresa não está no controle e não tem código na base";
    const { data: mesmoCodigo } = await controle.from("companies").select("id").eq("code", cod).maybeSingle();
    if (mesmoCodigo) return `código ${cod} já é de outro documento`;
    if (!gravar) return "empresa nova + vencimento";
    const ins = await controle.from("companies").insert({ code: cod, document: documento, document_type: documento.length === 14 ? "cnpj" : "cpf", corporate_name: certificateHolderName(a.meta.subject) || documento, origin: "import" }).select("id,code").single();
    if (ins.error) return "FALHA: não deu para criar a empresa no controle";
    emp = ins.data;
  }
  const { data: atual } = await controle.from("certificates").select("id,valid_to,attachment_path").eq("company_id", emp!.id).eq("is_current", true).eq("archived", false).order("valid_to", { ascending: false }).limit(1).maybeSingle();
  const novo = dia(a.meta.validUntil);
  if (atual && mesmoDia(atual.valid_to, novo)) {
    if (!atual.attachment_path && gravar) await anexarNoControle(controle, emp!.id, atual.id, codigoDoControle(emp), a.buffer, atual.valid_to);
    return "já tinha (igual)";
  }
  if (atual && atual.valid_to > novo) return "já tinha (mais novo)";
  if (!gravar) return atual ? `renova ${atual.valid_to} -> ${novo}` : "vencimento novo";
  // Grava o novo antes de tirar o atual: se a gravação falhar, a empresa continua com o certificado de antes.
  const ins = await controle.from("certificates").insert({ company_id: emp!.id, type: documento.length === 14 ? "e-cnpj" : "e-cpf", model: "A1", valid_from: dia(a.meta.validFrom), valid_to: novo, origin: "import", notes: "Enviado pelo portal" }).select("id").single();
  if (ins.error) return "FALHA: não deu para gravar o vencimento";
  if (atual) await controle.from("certificates").update({ is_current: false }).eq("id", atual.id).neq("id", ins.data.id);
  await controle.from("certificate_history").insert({ certificate_id: ins.data.id, company_id: emp!.id, action: atual ? "renewed" : "created", field_changed: "valid_to", old_value: atual?.valid_to ?? null, new_value: novo });
  await anexarNoControle(controle, emp!.id, ins.data.id, codigoDoControle(emp), a.buffer, novo);
  return atual ? `renovado ${atual.valid_to} -> ${novo}` : "vencimento novo";
}

export async function cadastrarA1(a: A1Aberto, opcoes: { gravar: boolean; atorId: string | null; codigo?: string | null }): Promise<ResultadoA1> {
  const db = createAdminClient();
  const documento = documentoDoA1(a.meta) ?? "";
  // O detalhe do erro fica só no log do servidor (sem senha nem arquivo); para quem chamou, mensagem genérica.
  const falha = (etapa: "emissor" | "controle") => (e: unknown) => {
    logEvent("error", "OFFICE_CERTIFICATE_IMPORT_FAILED", { etapa, error: e instanceof Error ? e.name : "unknown", detalhe: e instanceof Error ? e.message.slice(0, 200) : undefined });
    return "FALHA: erro inesperado (detalhe no log do servidor)";
  };
  const emissor = await noEmissor(db, a, opcoes.gravar, opcoes.atorId).catch((e) => ({ emissor: falha("emissor")(e) }));
  const controle = documento ? await noControle(a, documento, opcoes.codigo ?? null, opcoes.gravar).catch(falha("controle")) : "sem documento no certificado";
  return { documento, titular: certificateHolderName(a.meta.subject), validade: dia(a.meta.validUntil), controle, ...emissor };
}
