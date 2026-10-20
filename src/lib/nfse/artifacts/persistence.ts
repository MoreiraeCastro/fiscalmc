import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { FISCAL_ARTIFACTS_BUCKET } from "./model";

type PersistInput={
  invoiceId:string;
  organizationId:string;
  artifactType:"NFSE_XML"|"DANFSE_PDF";
  content:Buffer;
  contentType:"application/xml"|"application/pdf";
};

type StoredArtifactType=PersistInput["artifactType"]|"CANCELLATION_EVENT_XML";

export function officialArtifactStoragePath(input:{invoiceId:string;organizationId:string;artifactType:StoredArtifactType}){
  const file=input.artifactType==="NFSE_XML"?"nfse.xml":input.artifactType==="CANCELLATION_EVENT_XML"?"evento-cancelamento.xml":"danfse.pdf";
  return `${input.organizationId}/${input.invoiceId}/${file}`;
}

/** Stores documents only in the private bucket and records no document body in audit data. */
export async function persistOfficialArtifact(input:PersistInput){
  return persistArtifact(input);
}

/** XML do evento de cancelamento (101101) devolvido pela SEFIN. */
export async function persistCancellationEventArtifact(input:Omit<PersistInput,"artifactType"|"contentType">){
  return persistArtifact({...input,artifactType:"CANCELLATION_EVENT_XML",contentType:"application/xml"});
}

async function persistArtifact(input:Omit<PersistInput,"artifactType">&{artifactType:StoredArtifactType}){
  const db=createAdminClient();
  const privateStoragePath=officialArtifactStoragePath(input);
  const checksum=createHash("sha256").update(input.content).digest("hex");
  const {error:uploadError}=await db.storage.from(FISCAL_ARTIFACTS_BUCKET).upload(privateStoragePath,input.content,{contentType:input.contentType,upsert:true});
  if(uploadError)throw new Error("FISCAL_ARTIFACT_STORAGE_FAILED");
  const {data,error}=await db.from("fiscal_artifacts").upsert({
    invoice_id:input.invoiceId,
    organization_id:input.organizationId,
    artifact_type:input.artifactType,
    source:"SEFIN",
    private_storage_path:privateStoragePath,
    content_type:input.contentType,
    checksum_sha256:checksum,
  },{onConflict:"invoice_id,artifact_type"}).select("id,artifact_type,private_storage_path,content_type,checksum_sha256").single();
  if(error||!data)throw new Error("FISCAL_ARTIFACT_PERSIST_FAILED");
  return data;
}
