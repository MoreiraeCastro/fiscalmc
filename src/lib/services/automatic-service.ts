import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceReadiness } from "@/lib/nfse/service-readiness";
import { displayNationalCode } from "@/lib/nfse/municipal-parameters/discovery";
import { findNbs } from "@/lib/organizations/nbs-activity-resolver";

/** auto_ready_source dos serviços montados no passo 2 com a lista nacional + parâmetros do município no ADN. */
export const ADN_AUTO_SOURCE = "ADN_MUNICIPAL_PARAMETERS";

const campos = "id,name,active,workflow_status,auto_ready_source,national_service_code_id,national_tax_code,municipal_service_code,municipal_service_mapping_id,dps_municipal_tax_code,dps_municipal_tax_code_source,service_location_municipality_code,nbs_code,iss_taxation,iss_rate_source,fiscal_reference,reviewed_at,reviewed_by";

export function isAdnAutomaticService(service: { workflow_status: string; auto_ready_source?: string | null }) {
  return service.workflow_status === "AUTO_READY" && service.auto_ready_source === ADN_AUTO_SOURCE;
}

/** Os 3 dígitos do cTribMun: .000 é o código sem complemento (a DPS sai sem cTribMun). */
export function dpsMunicipalTaxCodeFrom(municipalServiceCode: string) {
  const sufixo = municipalServiceCode.slice(-3);
  return sufixo === "000" ? null : sufixo;
}

export type ServicoAutomatico = { ok: true; serviceId: string; created: boolean } | { ok: false; erro: string };

/**
 * Serviço da empresa para o código escolhido no passo 2 ("Código de Tributação Nacional" + "Código Complementar Municipal" + NBS).
 * - Já existe um serviço pronto que o escritório configurou (revisado ou copiado de um revisado): usa esse, sem mexer.
 * - Já existe um automático do ADN: atualiza o complemento e a NBS se mudaram.
 * - Existe um rascunho/pendente parado: vira o automático.
 * - Não existe: cria.
 * A alíquota não é gravada: a DPS sai sem pAliq e a Receita aplica a do município (como no Emissor Nacional).
 */
export async function ensureAutomaticService(input: {
  db: SupabaseClient;
  organizationId: string;
  municipalityCode: string;
  nationalServiceCodeId: string;
  municipalServiceCode: string;
  nbsCode: string;
  createdBy: string;
  actorType: "OFFICE" | "CLIENT";
}): Promise<ServicoAutomatico> {
  const { db, organizationId } = input;
  const { data: catalogo } = await db.from("national_service_codes").select("id,code,description").eq("id", input.nationalServiceCodeId).eq("active", true).maybeSingle();
  if (!catalogo) return { ok: false, erro: "Código de tributação nacional não encontrado." };
  if (!input.municipalServiceCode.startsWith(`${displayNationalCode(catalogo.code)}.`) || !/^\d{2}\.\d{2}\.\d{2}\.\d{3}$/.test(input.municipalServiceCode)) return { ok: false, erro: "Código complementar municipal inválido." };
  if (!findNbs(input.nbsCode)) return { ok: false, erro: "Item da NBS inválido." };

  const agora = new Date().toISOString();
  const fiscal = {
    national_service_code_id: catalogo.id,
    national_tax_code: catalogo.code,
    municipal_service_code: input.municipalServiceCode,
    municipal_service_mapping_id: null,
    dps_municipal_tax_code: dpsMunicipalTaxCodeFrom(input.municipalServiceCode),
    dps_municipal_tax_code_source: dpsMunicipalTaxCodeFrom(input.municipalServiceCode) ? ADN_AUTO_SOURCE : null,
    service_location_municipality_code: input.municipalityCode,
    nbs_code: input.nbsCode,
    iss_taxation: "1",
    iss_rate_source: "PARAMETRIZED_BY_NATIONAL",
    // Sem DPS aceita de referência: no banco a coluna é not null e "vazio" é {}.
    fiscal_reference: {},
  };

  const { data: existentes } = await db.from("service_templates").select(campos).eq("organization_id", organizationId).eq("national_service_code_id", catalogo.id);
  const pronto = (existentes ?? []).find((item) => !isAdnAutomaticService(item) && getServiceReadiness(item).ready);
  if (pronto) return { ok: true, serviceId: pronto.id, created: false };

  const automatico = (existentes ?? []).find((item) => isAdnAutomaticService(item));
  const parado = automatico ?? (existentes ?? []).find((item) => !item.active);
  if (parado) {
    const mudou = !automatico || automatico.municipal_service_code !== input.municipalServiceCode || automatico.nbs_code !== input.nbsCode || !automatico.active;
    if (mudou) {
      const { error } = await db.from("service_templates").update({ ...fiscal, workflow_status: "AUTO_READY", active: true, reviewed_at: null, reviewed_by: null, auto_ready_at: agora, auto_ready_source: ADN_AUTO_SOURCE }).eq("id", parado.id).eq("organization_id", organizationId);
      if (error) { logFalha("update", error); return { ok: false, erro: "Não foi possível preparar o serviço para emissão." }; }
      await auditar(db, input, parado.id);
    }
    return { ok: true, serviceId: parado.id, created: false };
  }

  const nome = catalogo.description.slice(0, 160);
  const novo = { organization_id: organizationId, default_description: catalogo.description, created_by: input.createdBy, created_via: "CATALOG", ...fiscal, workflow_status: "AUTO_READY", active: true, auto_ready_at: agora, auto_ready_source: ADN_AUTO_SOURCE };
  let inserido = await db.from("service_templates").insert({ ...novo, name: nome }).select("id").single();
  // (organization_id, name) é único: se outro serviço já usa a descrição, o nome leva o código na frente.
  if (inserido.error?.code === "23505") inserido = await db.from("service_templates").insert({ ...novo, name: `${input.municipalServiceCode} ${catalogo.description}`.slice(0, 160) }).select("id").single();
  if (inserido.error || !inserido.data) { logFalha("insert", inserido.error); return { ok: false, erro: "Não foi possível preparar o serviço para emissão." }; }
  await auditar(db, input, inserido.data.id);
  return { ok: true, serviceId: inserido.data.id, created: true };
}

/** Motivo da recusa do banco (código e mensagem do Postgres, sem dados da empresa) para o log do serviço. */
function logFalha(operacao: "update" | "insert", error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: "error", event: "AUTOMATIC_SERVICE_WRITE_FAILED", operacao, code: error?.code ?? null, message: error?.message ?? null, details: error?.details ?? null, hint: error?.hint ?? null }));
}

async function auditar(db: SupabaseClient, input: { organizationId: string; createdBy: string; actorType: "OFFICE" | "CLIENT"; municipalServiceCode: string; nbsCode: string }, serviceId: string) {
  await db.from("audit_logs").insert({ organization_id: input.organizationId, actor_user_id: input.createdBy, actor_type: input.actorType, action: "service_auto_ready_from_adn", entity: "service_template", entity_id: serviceId, safe_metadata: { source: ADN_AUTO_SOURCE, municipalServiceCode: input.municipalServiceCode, nbsCode: input.nbsCode } });
}
