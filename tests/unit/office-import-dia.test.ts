import { describe, expect, it } from "vitest";
import { dia, mesmoDia } from "@/lib/certificates/office-import";

describe("vencimento do A1 no controle", () => {
  it("usa o dia civil de Brasília, não o de UTC", () => {
    expect(dia("2027-03-10T23:30:00.000Z")).toBe("2027-03-10");
    expect(dia("2027-03-11T01:30:00.000Z")).toBe("2027-03-10");
    expect(dia("2027-03-11T01:30:00+00:00")).toBe("2027-03-10");
    expect(dia("2027-03-11T03:00:00.000Z")).toBe("2027-03-11");
  });

  it("aceita um dia de diferença como o mesmo vencimento", () => {
    expect(mesmoDia("2027-03-10", "2027-03-10")).toBe(true);
    expect(mesmoDia("2027-03-11", "2027-03-10")).toBe(true);
    expect(mesmoDia("2027-03-09", "2027-03-10")).toBe(true);
    expect(mesmoDia("2027-03-12", "2027-03-10")).toBe(false);
    expect(mesmoDia("2028-03-10", "2027-03-10")).toBe(false);
  });
});
