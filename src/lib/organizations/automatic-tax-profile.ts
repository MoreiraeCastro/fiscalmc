import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAutomaticFiscalConfiguration, type CnpjTaxStatus } from "@/lib/nfse/fiscal-configuration";
import { logEvent } from "@/lib/observability/logger";

const simplesSchema = z.object({
  opcao_pelo_simples: z.boolean().nullable().optional(),
  opcao_pelo_mei: z.boolean().nullable().optional(),
});

/**
 * Situação no Simples e no MEI pela base pública da Receita (BrasilAPI, a mesma da consulta de CNPJ do cadastro).
 * null = não deu para saber; aí o perfil não é criado (nunca se adivinha o regime).
 */
export async function lookupCnpjTaxStatus(cnpj: string): Promise<CnpjTaxStatus | null> {
  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; FiscalMC/1.0; +https://fiscalmc.vercel.app)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const parsed = simplesSchema.safeParse(await response.json());
    if (!parsed.success || typeof parsed.data.opcao_pelo_simples !== "boolean") return null;
    return { simples: parsed.data.opcao_pelo_simples, mei: parsed.data.opcao_pelo_mei === true };
  } catch {
    return null;
  }
}

/**
 * "Subiu o A1, está pronto": cria o perfil fiscal automático da empresa se ela ainda não tiver um.
 * Nunca mexe num perfil existente (o do escritório vale sempre). Não lança erro: o cadastro não pode falhar por isso.
 */
export async function ensureAutomaticTaxProfile(db: SupabaseClient, organizationId: string): Promise<"EXISTS" | "CREATED" | "UNAVAILABLE"> {
  try {
    const { data: existing } = await db.from("tax_profiles").select("id").eq("organization_id", organizationId).maybeSingle();
    if (existing) return "EXISTS";
    const { data: organization } = await db.from("organizations").select("tax_id").eq("id", organizationId).maybeSingle();
    if (!organization?.tax_id) return "UNAVAILABLE";
    const status = await lookupCnpjTaxStatus(organization.tax_id);
    if (!status) return "UNAVAILABLE";
    const { taxRegime, dpsConfiguration } = buildAutomaticFiscalConfiguration(status);
    const { error } = await db.from("tax_profiles").insert({
      organization_id: organizationId,
      tax_regime: taxRegime,
      dps_configuration: dpsConfiguration,
      origin: "AUTOMATIC",
      automatic_source: { source: "BRASILAPI_CNPJ", checkedAt: new Date().toISOString(), simples: status.simples, mei: status.mei },
    });
    // Corrida com outra requisição criando o mesmo perfil (organization_id é único): o que ficou lá vale.
    if (error) return error.code === "23505" ? "EXISTS" : "UNAVAILABLE";
    return "CREATED";
  } catch (error) {
    logEvent("error", "AUTOMATIC_TAX_PROFILE_FAILED", { organizationId, error: error instanceof Error ? error.name : "unknown" });
    return "UNAVAILABLE";
  }
}
