export type IssuanceMembership = {
  organizationId: string;
  role: "SUPER_ADMIN" | "OFFICE_STAFF" | "CLIENT_USER";
};

export type IssuanceContext = {
  organizationId: string;
  actorUserId: string;
  actorType: "CLIENT" | "OFFICE";
  role: IssuanceMembership["role"];
};

export function resolveIssuanceContextFromMemberships(input: {
  actorUserId: string;
  memberships: IssuanceMembership[];
  requestedOrganizationId?: string;
}): IssuanceContext {
  const officeMemberships = input.memberships.filter(
    (item) => item.role === "SUPER_ADMIN" || item.role === "OFFICE_STAFF",
  );

  if (input.requestedOrganizationId) {
    // Single-office platform (see 20260914140000_office_staff_sees_all_organizations): being office staff at all
    // authorizes issuing for any client organization; a per-organization membership row is not required.
    if (!officeMemberships.length) throw new Error("FORBIDDEN_OFFICE_ISSUANCE");
    return {
      organizationId: input.requestedOrganizationId,
      actorUserId: input.actorUserId,
      actorType: "OFFICE",
      role: officeMemberships.some((item) => item.role === "SUPER_ADMIN") ? "SUPER_ADMIN" : "OFFICE_STAFF",
    };
  }

  const clientMemberships = input.memberships.filter((item) => item.role === "CLIENT_USER");
  if (clientMemberships.length !== 1) throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
  return {
    organizationId: clientMemberships[0].organizationId,
    actorUserId: input.actorUserId,
    actorType: "CLIENT",
    role: "CLIENT_USER",
  };
}
