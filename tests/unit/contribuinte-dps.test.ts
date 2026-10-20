import { describe, expect, it } from "vitest";
import { aliquotaEmPontosBase, centavosParaTexto, mascaraValor, passoLiberado, passoPorSlug, previaValores, validarNovoTomador, validarPessoas, validarServico, validarValores, valorEmCentavos } from "@/lib/contribuinte/dps";

describe("valores em reais", () => {
  it("máscara enquanto digita", () => {
    expect(mascaraValor("1")).toBe("0,01");
    expect(mascaraValor("123456")).toBe("1.234,56");
    expect(mascaraValor("R$ 0010000")).toBe("100,00");
    expect(mascaraValor("")).toBe("");
  });
  it("texto → centavos", () => {
    expect(valorEmCentavos("1.234,56")).toBe(123456);
    expect(valorEmCentavos("100")).toBe(10000);
    expect(valorEmCentavos("100,5")).toBe(10050);
    expect(valorEmCentavos("0,00")).toBeNull();
    expect(valorEmCentavos("abc")).toBeNull();
    expect(centavosParaTexto(10000)).toBe("100,00");
  });
  it("alíquota em pontos-base", () => {
    expect(aliquotaEmPontosBase("2,5")).toBe(250);
    expect(aliquotaEmPontosBase("5%")).toBe(500);
    expect(aliquotaEmPontosBase("101")).toBeNull();
    expect(aliquotaEmPontosBase("x")).toBeNull();
  });
});

describe("validação dos passos", () => {
  it("Pessoas: competência obrigatória e não futura; tomador obrigatório", () => {
    const vazio = validarPessoas({ competencia: "", clienteId: "", hoje: "2026-10-20" });
    expect(vazio.ok).toBe(false);
    if (!vazio.ok) expect(vazio.erros).toEqual({ competencia: "Campo obrigatório", tomador: expect.any(String) });
    const futura = validarPessoas({ competencia: "2026-10-21", clienteId: "x", hoje: "2026-10-20" });
    expect(futura.ok).toBe(false);
    expect(validarPessoas({ competencia: "2026-10-20", clienteId: "x", hoje: "2026-10-20" }).ok).toBe(true);
  });
  it("tomador novo: CPF/CNPJ válido e nome", () => {
    const ok = validarNovoTomador({ documento: "00.000.000/0001-91", nome: " Banco ", email: "" });
    expect(ok).toEqual({ ok: true, valor: { documento: "00000000000191", nome: "Banco", email: null, tipo: "COMPANY" } });
    const ruim = validarNovoTomador({ documento: "11.111.111/1111-11", nome: "", email: "x@" });
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) expect(Object.keys(ruim.erros).sort()).toEqual(["documento", "email", "nome"]);
  });
  it("Serviço: serviço e descrição (3 a 1000)", () => {
    expect(validarServico({ modeloId: "", descricao: "ab" }).ok).toBe(false);
    expect(validarServico({ modeloId: "s", descricao: "x".repeat(1001) }).ok).toBe(false);
    expect(validarServico({ modeloId: "s", descricao: "  Honorários contábeis  " })).toEqual({ ok: true, valor: { modeloId: "s", descricao: "Honorários contábeis" } });
  });
  it("Valores: alíquota e fonte só quando o escritório precisa informar", () => {
    expect(validarValores({ valor: "100,00", aliquota: "", fonte: "", exigeAliquota: false })).toEqual({ ok: true, valor: { valorCentavos: 10000 } });
    const falta = validarValores({ valor: "100,00", aliquota: "", fonte: "", exigeAliquota: true });
    expect(falta.ok).toBe(false);
    expect(validarValores({ valor: "100,00", aliquota: "2", fonte: "Lei municipal 123", exigeAliquota: true }))
      .toEqual({ ok: true, valor: { valorCentavos: 10000, aliquotaManualBp: 200, fonteAliquota: "Lei municipal 123" } });
  });
});

describe("fluxo", () => {
  it("cada passo exige os anteriores", () => {
    expect(passoLiberado({})).toBe(1);
    const t = { clienteId: "c", documento: null, nome: "T" };
    expect(passoLiberado({ competencia: "2026-10-20", tomador: t })).toBe(2);
    expect(passoLiberado({ competencia: "2026-10-20", tomador: t, servico: { modeloId: "s", descricao: "abc" } })).toBe(3);
    expect(passoLiberado({ competencia: "2026-10-20", tomador: t, servico: { modeloId: "s", descricao: "abc" }, valores: { valorCentavos: 1 } })).toBe(4);
    expect(passoPorSlug("valores")?.numero).toBe(3);
    expect(passoPorSlug("x")).toBeNull();
  });
  it("prévia: ISSQN e líquido (retido desconta)", () => {
    expect(previaValores({ valorCentavos: 10000, aliquotaBp: 200, retido: false })).toEqual({ base: 10000, issqn: 200, retido: 0, liquido: 10000 });
    expect(previaValores({ valorCentavos: 10000, aliquotaBp: 500, retido: true })).toEqual({ base: 10000, issqn: 500, retido: 500, liquido: 9500 });
    expect(previaValores({ valorCentavos: 10000, retido: true }).issqn).toBeNull();
  });
});
