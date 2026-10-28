import { NextResponse, after } from "next/server";
import { runEmissionCheck } from "@/lib/operations/emission-check";
import { z } from "zod";
import { requireOfficeSession } from "@/lib/auth/session";
import { can } from "@/lib/security/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/nfse/certificate/encryption";
import { validateA1 } from "@/lib/nfse/certificate/parse";
import { classifyCertificate,normalizeTaxId } from "@/lib/nfse/certificate/status";

export const runtime="nodejs";
const maxCertificateBytes=5*1024*1024;
const passwordSchema=z.string().min(1).max(512);

class CertificateRequestError extends Error{constructor(readonly code:"INVALID_CERTIFICATE_PASSWORD"|"INVALID_CERTIFICATE_FILE"|"CERTIFICATE_ORGANIZATION_MISMATCH"|"CERTIFICATE_EXPIRED"|"CERTIFICATE_STORAGE_FAILED"|"CERTIFICATE_VAULT_UNAVAILABLE",message:string){super(message);}}
function humanError(error:unknown){
  if(error instanceof CertificateRequestError)return{status:422,error:error.message,code:error.code};
  return{status:422,error:"Não foi possível cadastrar o certificado.",code:"CERTIFICATE_STORAGE_FAILED"};
}
async function requireCertificateWrite(){const session=await requireOfficeSession();if(!can(session.role,"certificate:write"))throw new Error("FORBIDDEN_CERTIFICATE_WRITE");return session;}
async function requireCertificateRead(){const session=await requireOfficeSession();if(!can(session.role,"certificate:read"))throw new Error("FORBIDDEN_CERTIFICATE_READ");return session;}
async function getOrganization(id:string){
  if(!z.string().uuid().safeParse(id).success)return null;
  const{data,error}=await createAdminClient().from("organizations").select("id,tax_id").eq("id",id).maybeSingle();
  if(error)throw error;
  return data;
}

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    await requireCertificateRead();
    const{id}=await params;
    if(!await getOrganization(id))return NextResponse.json({error:"Empresa não encontrada."},{status:404});
    const{data,error}=await createAdminClient().from("digital_certificates").select("id,subject,issuer,serial,owner_tax_id,valid_from,valid_until,status,created_at").eq("organization_id",id).is("replaced_at",null).maybeSingle();
    if(error)throw error;
    return NextResponse.json({certificate:data??null});
  }catch{return NextResponse.json({error:"Acesso do escritório necessário."},{status:403});}
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  let storagePath:string|undefined;
  let organizationId:string|undefined;
  let actorUserId:string|undefined;
  let persistenceStage:"STORAGE"|"RPC"|undefined;
  try{
    const session=await requireCertificateWrite();
    actorUserId=session.userId;
    ({id:organizationId}=await params);
    const organization=await getOrganization(organizationId);
    if(!organization)return NextResponse.json({error:"Empresa não encontrada."},{status:404});
    const form=await request.formData();
    const file=form.get("file");
    const password=passwordSchema.parse(form.get("password"));
    if(!(file instanceof File))throw new CertificateRequestError("INVALID_CERTIFICATE_FILE","Selecione um arquivo .pfx ou .p12.");
    const extension=file.name.toLowerCase().split(".").pop();
    if(!["pfx","p12"].includes(extension??"")||file.size===0||file.size>maxCertificateBytes)throw new CertificateRequestError("INVALID_CERTIFICATE_FILE","Não foi possível ler este certificado A1.");
    const buffer=Buffer.from(await file.arrayBuffer());
    const validation=validateA1(buffer,password);
    if(validation.status==="INVALID_PASSWORD")throw new CertificateRequestError("INVALID_CERTIFICATE_PASSWORD","A senha do certificado está incorreta.");
    if(validation.status==="EXPIRED")throw new CertificateRequestError("CERTIFICATE_EXPIRED","O certificado está expirado.");
    if(validation.status!=="VALID"||!validation.metadata)throw new CertificateRequestError("INVALID_CERTIFICATE_FILE","Não foi possível ler este certificado A1.");
    if(!validation.metadata.ownerTaxId||normalizeTaxId(validation.metadata.ownerTaxId)!==normalizeTaxId(organization.tax_id))throw new CertificateRequestError("CERTIFICATE_ORGANIZATION_MISMATCH","O certificado pertence a outro CNPJ.");
    const status=classifyCertificate(validation.metadata);
    let encryptedPassword;
    try{encryptedPassword=encryptSecret(Buffer.from(password,"utf8"));}
    catch{throw new CertificateRequestError("CERTIFICATE_VAULT_UNAVAILABLE","O armazenamento seguro de certificados está indisponível. Tente novamente após a configuração do ambiente.");}
    const db=createAdminClient();
    const{data:current,error:currentError}=await db.from("digital_certificates").select("id").eq("organization_id",organizationId).is("replaced_at",null).maybeSingle();
    if(currentError)throw currentError;
    const storageId=crypto.randomUUID();
    storagePath=`organizations/${organizationId}/certificates/${storageId}.p12`;
    const{error:uploadError}=await db.storage.from("a1-certificates").upload(storagePath,buffer,{contentType:"application/x-pkcs12",upsert:false});
    if(uploadError){
      persistenceStage="STORAGE";
      console.error("CERTIFICATE_PERSISTENCE_FAILURE",{stage:persistenceStage,providerCode:uploadError.name??"UNKNOWN"});
      throw new CertificateRequestError("CERTIFICATE_STORAGE_FAILED","Não foi possível armazenar o certificado.");
    }
    persistenceStage="RPC";
    const{data:certificateId,error:registrationError}=await db.rpc("register_organization_certificate",{
      p_organization_id:organizationId,p_storage_path:storagePath,p_encrypted_password:encryptedPassword,
      p_serial:validation.metadata.serial,p_subject:validation.metadata.subject,p_issuer:validation.metadata.issuer,
      p_valid_from:validation.metadata.validFrom,p_valid_until:validation.metadata.validUntil,p_status:status,
      p_owner_tax_id:validation.metadata.ownerTaxId,p_fingerprint_sha256:validation.metadata.fingerprintSha256,
    });
    if(registrationError||!certificateId){
      console.error("CERTIFICATE_PERSISTENCE_FAILURE",{stage:persistenceStage,providerCode:registrationError?.code??"EMPTY_RESULT"});
      throw new CertificateRequestError("CERTIFICATE_STORAGE_FAILED","Não foi possível armazenar o certificado.");
    }
    storagePath=undefined;
    await db.from("audit_logs").insert({organization_id:organizationId,actor_user_id:session.userId,actor_type:"OFFICE",action:current?"certificate_replaced":"certificate_added",entity:"digital_certificate",entity_id:certificateId,safe_metadata:{status}});
    // Certificado novo: roda o teste de emissão depois da resposta (o resultado aparece na ficha da empresa).
    const checkedId=organizationId;
    if(checkedId)after(()=>runEmissionCheck(checkedId,{actorUserId:session.userId}).catch(()=>undefined));
    return NextResponse.json({certificate:{id:certificateId,subject:validation.metadata.subject,issuer:validation.metadata.issuer,serial:validation.metadata.serial,owner_tax_id:validation.metadata.ownerTaxId,valid_from:validation.metadata.validFrom,valid_until:validation.metadata.validUntil,status}},{status:201});
  }catch(error){
    if(storagePath)await createAdminClient().storage.from("a1-certificates").remove([storagePath]);
    if(error instanceof Error&&(error.message==="FORBIDDEN_CERTIFICATE_WRITE"||error.message==="UNAUTHENTICATED"||error.message==="FORBIDDEN_OFFICE"))return NextResponse.json({error:"Acesso do escritório necessário."},{status:403});
    if(error instanceof z.ZodError)return NextResponse.json({error:"Informe a senha do certificado."},{status:400});
    const output=humanError(error);
    if(organizationId&&actorUserId){try{await createAdminClient().from("audit_logs").insert({organization_id:organizationId,actor_user_id:actorUserId,actor_type:"OFFICE",action:"certificate_validation_failed",entity:"digital_certificate",entity_id:null,safe_metadata:{code:output.code,...(persistenceStage?{stage:persistenceStage}:{})}});}catch{}}
    return NextResponse.json({error:output.error,code:output.code},{status:output.status});
  }
}
