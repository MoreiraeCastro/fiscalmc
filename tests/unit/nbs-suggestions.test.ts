import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { nbsForLc116 } from "@/lib/organizations/nbs-activity-resolver";

describe("NBS sugeridas no passo Serviço", () => {
  it("medicina (04.01) traz a 1.2301.22.00 da tabela oficial e a 1.2301.99.00 que o escritório usa", () => {
    expect(nbsForLc116("04", "01").map((nbs) => nbs.nbsDisplayCode)).toEqual(["1.2301.22.00", "1.2301.99.00"]);
  });
  it("não repete o .99.00 quando ele já é correlacionado", () => {
    const codes = nbsForLc116("4", "3").map((nbs) => nbs.nbsCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
