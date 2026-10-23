import { beforeEach, describe, expect, it, vi } from "vitest";

const adn = vi.hoisted(() => ({
  aliquota: { Incidencia: "SIM", Aliq: 5, DtIni: "2026-01-01T00:00:00", DtFim: null as string | null },
  retencoes: [] as unknown[],
}));

vi.mock("@/lib/supabase/admin", () => {
  const consulta = {
    select: () => consulta, eq: () => consulta, lte: () => consulta, or: () => consulta, order: () => consulta, limit: () => consulta,
    maybeSingle: async () => ({ data: null }),
    upsert: async () => ({ error: null }),
  };
  return { createAdminClient: () => ({ from: () => consulta }) };
});

vi.mock("@/lib/nfse/municipal-parameters/client", async (original) => {
  const real = await original<typeof import("@/lib/nfse/municipal-parameters/client")>();
  class MunicipalParametersProvider {
    async getAliquota(input: { serviceCode: string }) { return { aliquotas: { [input.serviceCode]: [adn.aliquota] }, mensagem: "" }; }
    async getRetentions() { return { mensagem: null, retencoes: { artigoSexto: { habilitado: true, historico: null }, retencoesMunicipais: adn.retencoes } }; }
  }
  return { ...real, MunicipalParametersProvider };
});

const { resolveFiscalConfiguration } = await import("@/lib/nfse/fiscal-rule-resolver");

const entrada = {
  organizationId: "nova", municipalityCode: "4314902", nationalTaxCode: "171901", municipalServiceCode: "17.19.01.000", dpsMunicipalTaxCode: null,
  nbsCode: "113022100", issTaxation: "1" as const, issRateSource: "PARAMETRIZED_BY_NATIONAL" as const, fiscalReference: null, taxRegime: "SIMPLES_NACIONAL" as const,
  serviceDate: "2026-10-01", automaticProfile: true, automaticService: true,
  dpsConfiguration: { version: 1, form: {}, technical: { iss: { withholdingType: "1" }, regime: { simpleNational: "3", simpleAssessment: "1", special: "0" }, totalTaxes: { indicator: "0" } } },
};

describe("emissão só com o A1: serviço automático do ADN", () => {
  beforeEach(() => {
    adn.aliquota = { Incidencia: "SIM", Aliq: 5, DtIni: "2026-01-01T00:00:00", DtFim: null };
    adn.retencoes = [];
  });

  it("DPS sem pAliq (a Receita aplica a do município) e alíquota do ADN só para a prévia", async () => {
    const resultado = await resolveFiscalConfiguration(entrada);
    expect(resultado.iss.rateSource).toBe("PARAMETRIZED_BY_NATIONAL");
    expect(resultado.iss.rateBasisPoints).toBeUndefined();
    expect(resultado.iss.parametrizedRateBasisPoints).toBe(500);
    expect(resultado.municipalServiceCode).toBe("17.19.01.000");
    expect(resultado.retention.officialRulesChecked).toBe(true);
  });

  it("recusa código sem incidência de ISS no município", async () => {
    adn.aliquota = { ...adn.aliquota, Incidencia: "NAO" };
    await expect(resolveFiscalConfiguration(entrada)).rejects.toMatchObject({ code: "FISCAL_CONFIGURATION_INCOMPLETE" });
  });

  it("recusa quando o município obriga o tomador a reter o ISS deste código", async () => {
    adn.retencoes = [{ descricao: "Retenção", dataInicioVigencia: "2026-01-01T00:00:00", dataFimVigencia: null, tiposRetencao: [2], servicos: [{ codigoCompleto: "17.19.01.000", historico: null }] }];
    await expect(resolveFiscalConfiguration(entrada)).rejects.toMatchObject({ code: "MUNICIPAL_RETENTION_REQUIRED" });
  });
});
