import "server-only";

export const fiscalArtifactTypes = ["DPS_XML", "NFSE_XML", "DANFSE_PDF", "CANCELLATION_EVENT_XML"] as const;
export type FiscalArtifactType = (typeof fiscalArtifactTypes)[number];
export type FiscalArtifact = { id: string; invoice_id: string; organization_id: string; artifact_type: FiscalArtifactType; source: "SEFIN" | "MOCK" | "MANUAL_IMPORT"; private_storage_path: string; content_type: "application/xml" | "text/xml" | "application/pdf"; checksum_sha256: string | null; created_at: string };

export const FISCAL_ARTIFACTS_BUCKET = "nfse-documents";

export function artifactDownloadName(input: Pick<FiscalArtifact, "artifact_type"> & { nfseNumber?: string | null; invoiceId: string }) {
  const suffix = input.artifact_type === "DANFSE_PDF" ? "pdf" : "xml";
  const prefix = input.artifact_type === "DPS_XML" ? "dps" : input.artifact_type === "DANFSE_PDF" ? "danfse" : input.artifact_type === "CANCELLATION_EVENT_XML" ? "evento-cancelamento" : "nfse";
  const identifier = (input.nfseNumber ?? input.invoiceId).replace(/[^a-zA-Z0-9_-]/g, "");
  return `${prefix}-${identifier || "documento"}.${suffix}`;
}

export function hasOfficialNfseArtifact(artifacts: Pick<FiscalArtifact, "artifact_type">[]) {
  return artifacts.some((artifact) => artifact.artifact_type === "NFSE_XML");
}

export function hasDanfseArtifact(artifacts: Pick<FiscalArtifact, "artifact_type">[]) {
  return artifacts.some((artifact) => artifact.artifact_type === "DANFSE_PDF");
}
