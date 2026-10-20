import { describe, expect, it } from "vitest";
import { formatDpsDateTimeSaoPaulo } from "@/lib/nfse/dps/date-time";
import { validateDpsXml } from "@/lib/nfse/dps/xsd";
import { readFile } from "node:fs/promises";

const fixturePath = new URL("../../fixtures/dps/minimal-valid-unsigned.xml", import.meta.url);

describe("dhEmi da DPS", () => {
  const instant = new Date("2026-09-02T12:34:56.789Z");

  it("converte o mesmo instante para America/Sao_Paulo", () => {
    const formatted = formatDpsDateTimeSaoPaulo(instant);
    expect(formatted).toBe("2026-09-02T09:34:56-03:00");
    expect(Date.parse(formatted)).toBe(Math.floor(instant.getTime() / 1_000) * 1_000);
  });

  it("não simula uma conversão apenas trocando o offset", () => {
    const incorrectlyRelabeled = "2026-09-02T12:34:56-03:00";
    expect(Date.parse(incorrectlyRelabeled)).not.toBe(Math.floor(instant.getTime() / 1_000) * 1_000);
  });

  it("remove milissegundos e nunca produz horário posterior ao instante de geração", () => {
    const formatted = formatDpsDateTimeSaoPaulo(instant);
    expect(formatted).not.toContain(".");
    expect(Date.parse(formatted)).toBeLessThanOrEqual(instant.getTime());
  });

  it("continua válido no TSDateTimeUTC do XSD oficial", async () => {
    const xml = (await readFile(fixturePath, "utf8"))
      .replace("<dhEmi>2026-08-25T09:00:00-03:00</dhEmi>", `<dhEmi>${formatDpsDateTimeSaoPaulo(instant)}</dhEmi>`);
    await expect(validateDpsXml(xml, "PRODUCTION")).resolves.toMatchObject({ valid: true, errors: [] });
  });
});
