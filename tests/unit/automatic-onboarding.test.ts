import { describe, expect, it } from "vitest";
import { buildAutomaticFiscalConfiguration, getFiscalConfigurationReadiness, isFiscalProfileAccepted } from "@/lib/nfse/fiscal-configuration";
import { nextSuffixes, rateForCompetence, displayNationalCode } from "@/lib/nfse/municipal-parameters/discovery";
import { dpsMunicipalTaxCodeFrom, isAdnAutomaticService, ADN_AUTO_SOURCE } from "@/lib/services/automatic-service";
import { MSG, requiresMunicipalRetention, resolveFiscalConfiguration } from "@/lib/nfse/fiscal-rule-resolver";
import { findNbs, nbsForLc116 } from "@/lib/organizations/nbs-activity-resolver";
import { getOrganizationReadiness } from "@/lib/organizations/readiness";
import { assertDpsReadiness } from "@/lib/nfse/dps/readiness";

function automaticProfile(status: { simples: boolean; mei: boolean }) {
  const { taxRegime, dpsConfiguration } = buildAutomaticFiscalConfiguration(status);
  return { tax_regime: taxRegime, dps_configuration: dpsConfiguration, reviewed_at: null, reviewed_by: null, origin: "AUTOMATIC" };
}

describe("perfil fiscal automático (consulta de CNPJ)", () => {
  it("Simples ME/EPP: opção 3, apuração pelo SN, sem regime especial, ISS não retido", () => {
    const { dpsConfiguration, taxRegime } = buildAutomaticFiscalConfiguration({ simples: true, mei: false });
    expect(taxRegime).toBe("SIMPLES_NACIONAL");
    expect(dpsConfiguration.technical).toEqual({ iss: { withholdingType: "1" }, regime: { simpleNational: "3", simpleAssessment: "1", special: "0" }, totalTaxes: { indicator: "0" } });
  });

  it("MEI: opção 2, sem regime de apuração", () => {
    const { dpsConfiguration } = buildAutomaticFiscalConfiguration({ simples: true, mei: true });
    expect(dpsConfiguration.technical).toMatchObject({ regime: { simpleNational: "2", special: "0" } });
    expect((dpsConfiguration.technical as { regime: Record<string, string> }).regime.simpleAssessment).toBeUndefined();
  });

  it("não optante: opção 1 e regime em branco (a Receita não diz se é Presumido ou Real)", () => {
    const { dpsConfiguration, taxRegime } = buildAutomaticFiscalConfiguration({ simples: false, mei: false });
    expect(taxRegime).toBeNull();
    expect(dpsConfiguration.technical).toMatchObject({ regime: { simpleNational: "1" } });
  });

  it("fica AUTOMATIC e sem pendências, em todos os casos", () => {
    for (const status of [{ simples: true, mei: false }, { simples: true, mei: true }, { simples: false, mei: false }]) {
      const readiness = getFiscalConfigurationReadiness(automaticProfile(status));
      expect(readiness.status).toBe("AUTOMATIC");
      expect(readiness.missing).toEqual([]);
      expect(readiness.technical).not.toBeNull();
    }
  });

  it("o mesmo perfil, salvo pelo escritório, continua exigindo regime e revisão", () => {
    const profile = { ...automaticProfile({ simples: false, mei: false }), origin: "OFFICE" };
    const readiness = getFiscalConfigurationReadiness(profile);
    expect(readiness.status).toBe("PENDING_REVIEW");
    expect(readiness.missing).toContain("Regime tributário");
  });

  it("revisado pelo escritório vira REVIEWED, mesmo tendo nascido automático", () => {
    expect(getFiscalConfigurationReadiness({ ...automaticProfile({ simples: true, mei: false }), reviewed_at: "2026-10-23T12:00:00Z", reviewed_by: "u" }).status).toBe("REVIEWED");
  });

  it("a chave 'só serviços revisados' recusa o perfil automático", () => {
    expect(isFiscalProfileAccepted("AUTOMATIC", false)).toBe(true);
    expect(isFiscalProfileAccepted("AUTOMATIC", true)).toBe(false);
    expect(isFiscalProfileAccepted("REVIEWED", true)).toBe(true);
    expect(isFiscalProfileAccepted("PENDING_REVIEW", false)).toBe(false);
  });
});

describe("códigos complementares municipais (ADN)", () => {
  it("primeiro lote: .000 a .005; só segue enquanto acha complementos", () => {
    expect(nextSuffixes(0, false)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(nextSuffixes(6, true)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(nextSuffixes(6, false)).toEqual([]);
    expect(nextSuffixes(30, true)).toEqual([]);
  });

  it("formata o código nacional como o ADN espera", () => {
    expect(displayNationalCode("171901")).toBe("17.19.01");
  });

  it("escolhe a alíquota vigente na competência", () => {
    const itens = [
      { Incidencia: "SIM", Aliq: 2, DtIni: "2023-04-17T00:00:00", DtFim: "2025-12-31T00:00:00" },
      { Incidencia: "SIM", Aliq: 5, DtIni: "2026-01-01T00:00:00", DtFim: null },
    ];
    expect(rateForCompetence(itens, "2026-10-01")?.Aliq).toBe(5);
    expect(rateForCompetence(itens, "2025-06-01")?.Aliq).toBe(2);
    expect(rateForCompetence(itens, "2020-01-01")).toBeNull();
  });

  it(".000 é código sem complemento: a DPS sai sem cTribMun", () => {
    expect(dpsMunicipalTaxCodeFrom("04.01.01.000")).toBeNull();
    expect(dpsMunicipalTaxCodeFrom("17.19.01.001")).toBe("001");
  });

  it("reconhece o serviço automático do ADN pela origem", () => {
    expect(isAdnAutomaticService({ workflow_status: "AUTO_READY", auto_ready_source: ADN_AUTO_SOURCE })).toBe(true);
    expect(isAdnAutomaticService({ workflow_status: "AUTO_READY", auto_ready_source: "MUNICIPALITY_PROVEN_CONFIGURATION" })).toBe(false);
    expect(isAdnAutomaticService({ workflow_status: "REVIEWED", auto_ready_source: null })).toBe(false);
  });
});

describe("retenção municipal obrigatória", () => {
  const retencoes = {
    mensagem: null,
    retencoes: {
      artigoSexto: { habilitado: true, historico: null },
      retencoesMunicipais: [{ descricao: "Planos de saúde", dataInicioVigencia: "2026-01-01T00:00:00", dataFimVigencia: null, tiposRetencao: [2], servicos: [{ codigoCompleto: "10.01.04.001", historico: [{ dataInicioVigencia: "2026-01-01T00:00:00", dataFimVigencia: null }] }] }],
    },
  };
  it("acha a retenção do código completo vigente", () => {
    expect(requiresMunicipalRetention(retencoes, "10.01.04.001", "2026-10-01")).toBe(true);
  });
  it("ignora outro código e competência fora da vigência", () => {
    expect(requiresMunicipalRetention(retencoes, "17.19.01.001", "2026-10-01")).toBe(false);
    expect(requiresMunicipalRetention(retencoes, "10.01.04.001", "2025-10-01")).toBe(false);
  });
});

describe("NBS sugeridas pelo código nacional", () => {
  it("usa item/subitem da LC 116 sem zero à esquerda", () => {
    const sugestoes = nbsForLc116("01", "01");
    expect(sugestoes.length).toBeGreaterThan(0);
    expect(new Set(sugestoes.map((item) => item.nbsCode)).size).toBe(sugestoes.length);
  });
  it("valida a NBS escolhida contra a tabela", () => {
    expect(findNbs("115021000")?.nbsDisplayCode).toBe("1.1502.10.00");
    expect(findNbs("999999999")).toBeNull();
  });
});

describe("resolvedor: portas do fluxo automático", () => {
  const technical = { version: 1, form: {}, technical: { iss: { withholdingType: "1" }, regime: { simpleNational: "3", simpleAssessment: "1", special: "0" }, totalTaxes: { indicator: "0" } } };
  const base = { organizationId: "nova", municipalityCode: "4314902", nationalTaxCode: "171901", dpsMunicipalTaxCode: null, nbsCode: "113022100", issTaxation: "1" as const, issRateSource: "PARAMETRIZED_BY_NATIONAL" as const, fiscalReference: null, taxRegime: "SIMPLES_NACIONAL" as const, serviceDate: "2026-10-01", dpsConfiguration: technical };

  it("sem revisão e sem perfil automático aceito, recusa", async () => {
    await expect(resolveFiscalConfiguration({ ...base, municipalServiceCode: "17.19.01.000", automaticService: true })).rejects.toMatchObject({ code: "FISCAL_CONFIGURATION_INCOMPLETE" });
  });

  it("serviço automático sem código municipal completo, recusa", async () => {
    await expect(resolveFiscalConfiguration({ ...base, municipalServiceCode: null, automaticProfile: true, automaticService: true })).rejects.toMatchObject({ code: "FISCAL_CONFIGURATION_INCOMPLETE" });
  });

  it("serviço do escritório com código complementar segue o caminho automático, sem pedir alíquota", async () => {
    // Sem rede no teste a consulta aos parâmetros municipais falha; o que importa é não barrar antes por falta de referência ou de alíquota.
    const erro = await resolveFiscalConfiguration({ ...base, municipalServiceCode: "17.19.01.000", automaticProfile: true }).then(() => null, (error: { code?: string }) => error);
    expect(erro?.code).not.toBe("FISCAL_CONFIGURATION_INCOMPLETE");
    expect(erro?.code).not.toBe("FISCAL_SERVICE_MAPPING_MISSING");
  });

  it("cada bloqueio diz o que falta", async () => {
    await expect(resolveFiscalConfiguration({ ...base, municipalServiceCode: null, automaticProfile: true, automaticService: true })).rejects.toMatchObject({ safeMessage: MSG.codigoComplementar });
    await expect(resolveFiscalConfiguration({ ...base, municipalServiceCode: "17.19.01.000", automaticService: true })).rejects.toMatchObject({ safeMessage: MSG.perfil });
  });
});

describe("prontidão enxuta: só o que a emissão usa", () => {
  const base = { fiscal: { ready: true, message: "" }, services: { ready: true, message: "" }, certificate: { ready: true, message: "" } };

  it("endereço incompleto vira aviso e não trava", () => {
    const readiness = getOrganizationReadiness({ ...base, registration: {}, clientAccess: { ready: true, message: "" } });
    const registro = readiness.items.find((item) => item.key === "registration");
    expect(registro?.ready).toBe(true);
    expect(registro?.warning).toBeTruthy();
    expect(readiness.overallReady).toBe(true);
  });

  it("sem acesso do cliente continua pronta: o item é opcional", () => {
    const readiness = getOrganizationReadiness({ ...base, registration: { street: "Rua", addressNumber: "1", neighborhood: "Centro", state: "RJ" }, clientAccess: { ready: false, message: "Acesso do cliente não cadastrado." } });
    expect(readiness.overallReady).toBe(true);
    expect(readiness.items.find((item) => item.key === "clientAccess")).toMatchObject({ ready: false, optional: true });
  });

  it("perfil fiscal ou certificado faltando ainda travam", () => {
    expect(getOrganizationReadiness({ ...base, fiscal: { ready: false, message: "" }, registration: {}, clientAccess: { ready: true, message: "" } }).overallReady).toBe(false);
    expect(getOrganizationReadiness({ ...base, certificate: { ready: false, message: "" }, registration: {}, clientAccess: { ready: true, message: "" } }).overallReady).toBe(false);
  });

  it("a prontidão da DPS não exige o endereço do prestador (ele não vai na DPS)", async () => {
    await expect(assertDpsReadiness({
      organization: { legalName: "Prestador", taxId: "12345678000195", municipalRegistration: "", municipalityCode: "3304557", address: { street: "", number: "", neighborhood: "", postalCode: "", municipalityCode: "3304557", stateOrProvince: "" } },
      service: { nationalTaxCode: "171901", municipalTaxCode: "", locationMunicipalityCode: "3304557" },
      fiscal: { regime: { simpleNational: "3", special: "0" }, iss: { taxation: "1", withholding: "1", rateSource: "PARAMETRIZED_BY_NATIONAL" }, totalTaxes: { indicator: "0" } },
      verifyCertificate: false,
    })).resolves.toMatchObject({ certificateVerified: false });
  });
});
