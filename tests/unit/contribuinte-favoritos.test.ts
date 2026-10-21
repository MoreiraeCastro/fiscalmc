import { describe, expect, it } from "vitest";
import { passoLiberado } from "@/lib/contribuinte/dps";
import { favoritoDoRascunho, rascunhoDoFavorito } from "@/lib/contribuinte/favoritos";

const servico = { modeloId: "s1", descricao: "Honorários contábeis mensais" };
const tomador = { clienteId: "c1", documento: "00000000000191", nome: "BANCO DO BRASIL SA" };
const ibsCbs = { cst: "000", classificacao: "000001", indicadorOperacao: "100301", consumoPessoal: "0" as const };

describe("Serviços Favoritos", () => {
  it("favorito completo vira rascunho pronto para o passo 4 (competência de hoje)", () => {
    const dados = rascunhoDoFavorito({ servico, tomador, valorCentavos: 150000, informarIbsCbs: true, ibsCbs }, "2026-10-21");
    expect(dados).toEqual({ competencia: "2026-10-21", tomador, servico, valores: { valorCentavos: 150000 }, informarIbsCbs: true, ibsCbs });
    expect(passoLiberado(dados)).toBe(4);
  });

  it("sem tomador e sem valor: o rascunho para no passo 1", () => {
    const dados = rascunhoDoFavorito({ servico }, "2026-10-21");
    expect(dados).toEqual({ competencia: "2026-10-21", servico });
    expect(passoLiberado(dados)).toBe(1);
  });

  it("tomador não informado é guardado como tal", () => {
    expect(rascunhoDoFavorito({ servico, semTomador: true }, "2026-10-21").semTomador).toBe(true);
  });

  it("salvar o rascunho como favorito leva serviço, tomador, valor e IBS/CBS, sem competência", () => {
    expect(favoritoDoRascunho({ competencia: "2026-10-21", tomador, servico, valores: { valorCentavos: 100, aliquotaManualBp: 200, fonteAliquota: "Lei" }, informarIbsCbs: true, ibsCbs }))
      .toEqual({ servico, tomador, valorCentavos: 100, informarIbsCbs: true, ibsCbs });
    expect(favoritoDoRascunho({ competencia: "2026-10-21" })).toBeNull();
  });
});
