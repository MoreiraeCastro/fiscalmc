import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { nbsForLc116 } from "@/lib/organizations/nbs-activity-resolver";

describe("NBS possíveis para o serviço escolhido", () => {
  it("medicina (04.01): grupo 1.2301 inteiro, com a 22.00 oficial primeiro e a 99.00 disponível", () => {
    const lista = nbsForLc116("04", "01");
    expect(lista[0]).toMatchObject({ nbsDisplayCode: "1.2301.22.00", oficial: true });
    expect(lista.map((nbs) => nbs.nbsDisplayCode)).toContain("1.2301.99.00");
    expect(lista.every((nbs) => nbs.nbsCode.startsWith("12301"))).toBe(true);
    expect(lista).toHaveLength(18);
  });
  it("não repete NBS", () => {
    const codes = nbsForLc116("4", "3").map((nbs) => nbs.nbsCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
