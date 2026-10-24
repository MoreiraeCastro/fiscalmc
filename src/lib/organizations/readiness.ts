export type ReadinessItemKey = "registration" | "fiscal" | "services" | "certificate" | "clientAccess";
/** optional = aparece na lista, mas não impede a emissão nem conta como pendência. */
export type ReadinessItem = { key: ReadinessItemKey; ready: boolean; message: string; warning?: string; optional?: boolean };

export function getOrganizationReadiness(input: {
  registration: { municipalRegistration?: string | null; street?: string | null; addressNumber?: string | null; neighborhood?: string | null; state?: string | null };
  fiscal: { ready: boolean; message: string };
  services: { ready: boolean; message: string };
  certificate: { ready: boolean; message: string; warning?: string };
  clientAccess: { ready: boolean; message: string };
}) {
  // O endereço do prestador não vai na DPS (a SEFIN usa o cadastro da Receita): incompleto vira aviso, não trava a emissão.
  const addressComplete = Boolean(input.registration.street?.trim() && input.registration.addressNumber?.trim() && input.registration.neighborhood?.trim() && input.registration.state?.trim());
  const items: ReadinessItem[] = [
    { key: "registration", ready: true, message: addressComplete ? "Dados cadastrais completos." : "Dados cadastrais em uso; o endereço está incompleto.", ...(addressComplete ? {} : { warning: "Endereço incompleto: não impede a emissão, mas vale completar." }) },
    { key: "fiscal", ...input.fiscal },
    { key: "services", ...input.services },
    { key: "certificate", ...input.certificate },
    // O escritório emite sem acesso do cliente; ele só é necessário para o próprio cliente emitir pelo portal.
    { key: "clientAccess", ...input.clientAccess, optional: true, message: input.clientAccess.ready ? input.clientAccess.message : "Opcional: só se o cliente for emitir pelo portal." },
  ];
  return { items, overallReady: items.every((item) => item.ready || item.optional) };
}
