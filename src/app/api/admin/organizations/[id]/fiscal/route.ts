import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOfficeSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { fiscalConfigurationFormSchema,fiscalTechnicalConfigurationSchema,getFiscalConfigurationReadiness,normalizeFiscalConfiguration } from "@/lib/nfse/fiscal-configuration";

const fiscalPatchSchema=z.object({form:fiscalConfigurationFormSchema,technical:fiscalTechnicalConfigurationSchema.optional()});

async function organizationExists(organizationId:string){
  const {data,error}=await createAdminClient().from("organizations").select("id").eq("id",organizationId).maybeSingle();
  if(error)throw error;
  return data;
}
async function writeAudit(action:"tax_profile_created"|"tax_profile_updated"|"tax_profile_reviewed",organizationId:string,actor:string){
  await createAdminClient().from("audit_logs").insert({organization_id:organizationId,actor_user_id:actor,actor_type:"OFFICE",action,entity:"tax_profile",entity_id:organizationId,safe_metadata:{}});
}
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    await requireOfficeSession();
    const {id}=await params;
    if(!z.string().uuid().safeParse(id).success||!await organizationExists(id))return NextResponse.json({error:"Empresa não encontrada."},{status:404});
    const {data:profile,error}=await createAdminClient().from("tax_profiles").select("tax_regime,dps_configuration,reviewed_at,reviewed_by,origin").eq("organization_id",id).maybeSingle();
    if(error)throw error;
    return NextResponse.json({configuration:getFiscalConfigurationReadiness(profile)});
  }catch{return NextResponse.json({error:"Não foi possível carregar a configuração fiscal."},{status:403});}
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const session=await requireOfficeSession();
    const {id}=await params;
    const raw=await request.json();
    const input=fiscalPatchSchema.safeParse(raw);
    const {form,technical}=input.success?input.data:{form:fiscalConfigurationFormSchema.parse(raw),technical:undefined};
    if(!await organizationExists(id))return NextResponse.json({error:"Empresa não encontrada."},{status:404});
    const admin=createAdminClient();
    const {data:previous,error:previousError}=await admin.from("tax_profiles").select("dps_configuration").eq("organization_id",id).maybeSingle();
    if(previousError)throw previousError;
    const {error}=await admin.from("tax_profiles").upsert({organization_id:id,tax_regime:form.taxRegime,dps_configuration:normalizeFiscalConfiguration(form,previous?.dps_configuration,technical),reviewed_at:null,reviewed_by:null,origin:"OFFICE"},{onConflict:"organization_id"});
    if(error)throw error;
    await writeAudit(previous?"tax_profile_updated":"tax_profile_created",id,session.userId);
    const {data:profile}=await admin.from("tax_profiles").select("tax_regime,dps_configuration,reviewed_at,reviewed_by,origin").eq("organization_id",id).single();
    return NextResponse.json({configuration:getFiscalConfigurationReadiness(profile)});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Revise a configuração fiscal informada."},{status:400});
    return NextResponse.json({error:"Não foi possível salvar o rascunho fiscal."},{status:422});
  }
}
export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const session=await requireOfficeSession();
    const {id}=await params;
    if(!await organizationExists(id))return NextResponse.json({error:"Empresa não encontrada."},{status:404});
    const admin=createAdminClient();
    const {data:profile,error}=await admin.from("tax_profiles").select("tax_regime,dps_configuration,reviewed_at,reviewed_by,origin").eq("organization_id",id).maybeSingle();
    if(error)throw error;
    const readiness=getFiscalConfigurationReadiness(profile);
    if(!profile||readiness.status==="INVALID"||readiness.missing.length)return NextResponse.json({error:"Conclua os campos fiscais pendentes antes de marcar como revisado.",missing:readiness.missing},{status:422});
    const now=new Date().toISOString();
    const {error:updateError}=await admin.from("tax_profiles").update({reviewed_at:now,reviewed_by:session.userId}).eq("organization_id",id);
    if(updateError)throw updateError;
    await writeAudit("tax_profile_reviewed",id,session.userId);
    return NextResponse.json({configuration:{...readiness,status:"REVIEWED",reviewedAt:now,reviewedBy:session.displayName}});
  }catch{return NextResponse.json({error:"Não foi possível registrar a revisão fiscal."},{status:422});}
}
