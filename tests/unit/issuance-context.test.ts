import { describe, expect, it } from "vitest";
import { resolveIssuanceContextFromMemberships } from "@/lib/auth/issuance-context";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const organizationA = "22222222-2222-4222-8222-222222222222";
const organizationB = "33333333-3333-4333-8333-333333333333";

describe("contexto de emissão", () => {
  it("deriva a organização do CLIENT_USER e preserva o ator", () => {
    expect(resolveIssuanceContextFromMemberships({
      actorUserId,
      memberships: [{ organizationId: organizationA, role: "CLIENT_USER" }],
    })).toEqual({ organizationId: organizationA, actorUserId, actorType: "CLIENT", role: "CLIENT_USER" });
  });

  it("impede CLIENT_USER de escolher até a própria organização", () => {
    expect(() => resolveIssuanceContextFromMemberships({
      actorUserId,
      requestedOrganizationId: organizationA,
      memberships: [{ organizationId: organizationA, role: "CLIENT_USER" }],
    })).toThrow("FORBIDDEN_OFFICE_ISSUANCE");
  });

  it("resolve a empresa selecionada para OFFICE associado e preserva o ator real", () => {
    expect(resolveIssuanceContextFromMemberships({
      actorUserId,
      requestedOrganizationId: organizationA,
      memberships: [{ organizationId: organizationA, role: "OFFICE_STAFF" }],
    })).toEqual({ organizationId: organizationA, actorUserId, actorType: "OFFICE", role: "OFFICE_STAFF" });
  });

  it("OFFICE emite por qualquer empresa atendida, sem vínculo por empresa (escritório único)", () => {
    expect(resolveIssuanceContextFromMemberships({
      actorUserId,
      requestedOrganizationId: organizationB,
      memberships: [{ organizationId: organizationA, role: "OFFICE_STAFF" }],
    })).toEqual({ organizationId: organizationB, actorUserId, actorType: "OFFICE", role: "OFFICE_STAFF" });
  });

  it("bloqueia ator sem membership ativa para emissão", () => {
    expect(() => resolveIssuanceContextFromMemberships({
      actorUserId,
      requestedOrganizationId: organizationA,
      memberships: [],
    })).toThrow("FORBIDDEN_OFFICE_ISSUANCE");
  });

  it("exige seleção explícita de empresa para usuário exclusivamente OFFICE", () => {
    expect(() => resolveIssuanceContextFromMemberships({
      actorUserId,
      memberships: [{ organizationId: organizationA, role: "SUPER_ADMIN" }],
    })).toThrow("ORGANIZATION_CONTEXT_REQUIRED");
  });

  it("não aceita contexto ambíguo de cliente", () => {
    expect(() => resolveIssuanceContextFromMemberships({
      actorUserId,
      memberships: [
        { organizationId: organizationA, role: "CLIENT_USER" },
        { organizationId: organizationB, role: "CLIENT_USER" },
      ],
    })).toThrow("ORGANIZATION_CONTEXT_REQUIRED");
  });
});
