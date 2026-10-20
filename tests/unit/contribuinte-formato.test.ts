import { describe, expect, it } from "vitest";
import { formatarCompetencia, formatarData, formatarDataHora, formatarDocumento, formatarValor, hojeBrasilia, inicioDoDiaBrasilia, pessoa, situacaoNota, somarDias } from "@/lib/contribuinte/formato";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";

describe("formato do Portal Contribuinte", () => {
  it("formata CPF, CNPJ e CNPJ alfanumérico", () => {
    expect(formatarDocumento("00000000000191")).toBe("00.000.000/0001-91");
    expect(formatarDocumento("12345678909")).toBe("123.456.789-09");
    expect(formatarDocumento("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    expect(formatarDocumento(null)).toBe("");
  });

  it("monta a coluna Emitida para", () => {
    expect(pessoa("00000000000191", "BANCO DO BRASIL SA")).toBe("00.000.000/0001-91 - BANCO DO BRASIL SA");
    expect(pessoa(null, "Tomador do exterior")).toBe("Tomador do exterior");
    expect(pessoa(null, null)).toBe("Não informado");
  });

  it("valor, competência e datas no fuso de Brasília", () => {
    expect(formatarValor(1234567)).toBe("12.345,67");
    expect(formatarCompetencia("2026-10-20")).toBe("10/2026");
    expect(formatarData("2026-10-20")).toBe("20/10/2026");
    expect(formatarData("2026-10-21T01:30:00Z")).toBe("20/10/2026");
    expect(formatarDataHora("2026-10-21T01:30:00Z")).toBe("20/10/2026, 22:30");
    expect(hojeBrasilia(new Date("2026-10-21T02:00:00Z"))).toBe("2026-10-20");
  });

  it("filtro de datas cobre o dia inteiro de Brasília", () => {
    expect(inicioDoDiaBrasilia("2026-10-20")).toBe("2026-10-20T03:00:00.000Z");
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-10-20", -30)).toBe("2026-09-20");
  });

  it("situação no vocabulário do portal", () => {
    expect(situacaoNota("ISSUED")).toEqual({ rotulo: "NFS-e Gerada", tom: "ok" });
    expect(situacaoNota("UNKNOWN").tom).toBe("alerta");
    expect(situacaoNota("CANCELLED").rotulo).toBe("Cancelada");
  });

  it("município pelo código IBGE", () => {
    expect(nomeMunicipio("3106200")).toBe("Belo Horizonte/MG");
    expect(nomeMunicipio("9999999")).toBe("9999999");
    expect(nomeMunicipio(null)).toBe("—");
  });
});
