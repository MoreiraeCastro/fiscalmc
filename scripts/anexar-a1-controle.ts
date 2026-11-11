// Copia o arquivo do A1 guardado no cofre do emissor para o anexo do certificado atual no controle de certificados
// (Certificados e Alvarás). Só preenche anexo vazio, e só quando o vencimento do controle é o mesmo do arquivo.
// Precisa da migração 0019_certificate_attachments do certificados. Simula sem --gravar.
//   node_modules/.bin/tsx --env-file=.env.local --import ./scripts/server-only-shim.mjs scripts/anexar-a1-controle.ts [--gravar]
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const GRAVAR = process.argv.includes("--gravar");
const db = createAdminClient();
const ctrl = createClient(process.env.CONTROLE_SUPABASE_URL!, process.env.CONTROLE_SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const { data: certs } = await db.from("digital_certificates").select("organization_id,storage_path,valid_until,organizations(tax_id)").is("replaced_at", null).limit(5000);
const r: Record<string, number> = {};
const conta = (k: string) => { r[k] = (r[k] ?? 0) + 1; };
for (const c of certs ?? []) {
  const org = (Array.isArray(c.organizations) ? c.organizations[0] : c.organizations) as { tax_id: string } | null;
  if (!org) { conta("sem empresa"); continue; }
  const { data: emp } = await ctrl.from("companies").select("id,code").eq("document", org.tax_id).maybeSingle();
  if (!emp) { conta("empresa fora do controle"); continue; }
  const { data: atual } = await ctrl.from("certificates").select("id,valid_to,attachment_path").eq("company_id", emp.id).eq("is_current", true).eq("archived", false).order("valid_to", { ascending: false }).limit(1).maybeSingle();
  if (!atual) { conta("sem certificado atual no controle"); continue; }
  if (atual.attachment_path) { conta("já tinha anexo"); continue; }
  if (atual.valid_to !== String(c.valid_until).slice(0, 10)) { conta("vencimento diferente (não anexa)"); continue; }
  if (!GRAVAR) { conta("anexaria"); continue; }
  const { data: arquivo, error } = await db.storage.from("a1-certificates").download(c.storage_path);
  if (error || !arquivo) { conta("FALHA: leitura do cofre"); continue; }
  const nome = `${emp.code} - A1 ${atual.valid_to}.pfx`;
  const path = `${emp.id}/${atual.id}/${Date.now()}-${nome.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const up = await ctrl.storage.from("certificado-anexos").upload(path, buffer, { contentType: "application/x-pkcs12" });
  if (up.error) { conta("FALHA: envio"); continue; }
  await ctrl.from("certificates").update({ attachment_path: path, attachment_name: nome, attachment_size: buffer.length, attachment_uploaded_at: new Date().toISOString() }).eq("id", atual.id);
  conta("anexado");
}
console.log(GRAVAR ? "GRAVADO" : "SIMULAÇÃO", JSON.stringify(r));
