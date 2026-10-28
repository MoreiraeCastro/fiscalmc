import { describe, expect, it } from "vitest";
import { appRedirectLocation } from "@/lib/base-path";
import { GENERIC_REJECTION_MESSAGE, problemGuide, resolvedByLaterIssue, sefinText } from "@/lib/operations/emission-problems";

describe("painel Não emitidas", () => {
  it("traduz rejeição conhecida da Receita e bloqueio interno", () => {
    expect(problemGuide("E0330", "RECEITA").titulo).toBe("Tomador no exterior sem comércio exterior");
    expect(problemGuide("FISCAL_CONFIGURATION_REVIEW", "ANTES_DO_ENVIO").onde).toBe("configuracao");
    expect(problemGuide("E0999", "RECEITA").titulo).toBe("Rejeitada pela Receita (E0999)");
    expect(problemGuide(null, "CONFIRMACAO").titulo).toBe("Situação em confirmação");
  });
  it("mostra o texto da Receita sem o código e esconde a mensagem genérica antiga", () => {
    expect(sefinText("E0330 - Grupo comExt obrigatório", "E0330")).toBe("Grupo comExt obrigatório");
    expect(sefinText(GENERIC_REJECTION_MESSAGE, "E0006")).toBe("");
  });
  it("considera resolvido quando a empresa emitiu depois para o mesmo tomador", () => {
    const problema = { organizationId: "o1", customerId: "c1", at: "2026-10-27T10:00:00Z" };
    expect(resolvedByLaterIssue(problema, [{ organizationId: "o1", customerId: "c1", at: "2026-10-27T11:00:00Z" }])).toBe(true);
    expect(resolvedByLaterIssue(problema, [{ organizationId: "o1", customerId: "c2", at: "2026-10-27T11:00:00Z" }])).toBe(false);
    expect(resolvedByLaterIssue(problema, [{ organizationId: "o1", customerId: "c1", at: "2026-10-27T09:00:00Z" }])).toBe(false);
  });
});

describe("redirecionamento dos route handlers", () => {
  it("fica dentro do app, sem host interno nem outro site", () => {
    expect(appRedirectLocation("/contribuinte/nova")).toBe("/emissor/contribuinte/nova");
    expect(appRedirectLocation("//evil.com")).toBe("/emissor/contribuinte");
    expect(appRedirectLocation("https://evil.com")).toBe("/emissor/contribuinte");
  });
});
