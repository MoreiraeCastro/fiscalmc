import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOfficeSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCnaeActivity } from "@/lib/organizations/cnae-activity-resolver";
import { createServiceFromNationalCode } from "@/lib/services/catalog-linking";
import { logEvent } from "@/lib/observability/logger";

const optionalText=(maximum:number)=>z.string().trim().max(maximum).optional().transform(value=>value||null);
const cnaeSecundarioInput=z.object({code:z.string().regex(/^\d{7}$/),description:z.string().trim().min(1).max(250)});
const organizationInput=z.object({
  legalName:z.string().trim().min(2).max(250),
  tradeName:optionalText(250),
  taxId:z.string().transform(value=>value.replace(/\D/g,"")).pipe(z.string().regex(/^\d{14}$/)),
  municipalityCode:z.string().transform(value=>value.replace(/\D/g,"")).pipe(z.string().regex(/^\d{7}$/)),
  municipalRegistration:optionalText(80),
  postalCode:z.string().transform(value=>value.replace(/\D/g,"")).pipe(z.string().regex(/^\d{8}$/).or(z.literal(""))).transform(value=>value||null),
  street:optionalText(180),
  addressNumber:optionalText(40),
  addressComplement:optionalText(120),
  neighborhood:optionalText(120),
  state:z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).or(z.literal("")).transform(value=>value||null),
  email:z.string().trim().email().or(z.literal("")).transform(value=>value||null),
  phone:optionalText(40),
  cnaeFiscalCode:z.string().regex(/^\d{7}$/).or(z.literal("")).transform(value=>value||null),
  cnaeFiscalDescription:optionalText(250),
  cnaesSecundarios:z.array(cnaeSecundarioInput).max(50).optional().default([])
});
type OrganizationInput=z.infer<typeof organizationInput>;
function toOrganizationPayload(data:OrganizationInput){return{legal_name:data.legalName,trade_name:data.tradeName,tax_id:data.taxId,municipality_code:data.municipalityCode,municipal_registration:data.municipalRegistration,postal_code:data.postalCode,street:data.street,address_number:data.addressNumber,address_complement:data.addressComplement,neighborhood:data.neighborhood,state:data.state,email:data.email,phone:data.phone,cnae_fiscal_code:data.cnaeFiscalCode,cnae_fiscal_description:data.cnaeFiscalDescription,cnaes_secundarios:data.cnaesSecundarios};}

/** Best-effort: links the primary CNAE's activity when the correlation resolves to exactly one candidate. Never blocks company registration. */
async function linkPrimaryActivity(db:SupabaseClient,organizationId:string,cnaeFiscalCode:string|null,officeUserId:string){
  if(!cnaeFiscalCode)return;
  try{
    const resolution=await resolveCnaeActivity(db,cnaeFiscalCode);
    if(resolution.candidates.length!==1)return;
    await createServiceFromNationalCode({db,organizationId,nationalServiceCodeId:resolution.candidates[0].nationalServiceCodeId,createdBy:officeUserId,actorType:"OFFICE",allowAutoReady:true});
  }catch{ /* company registration must not fail because of this */ }
}

export async function POST(request:Request){
  try{
    const office=await requireOfficeSession();
    const data=organizationInput.parse(await request.json());
    const db=createAdminClient();
    const {data:organization,error}=await db.from("organizations").insert({...toOrganizationPayload(data),status:"ACTIVE",emission_blocked:false}).select("id").single();
    if(error)throw error;
    await linkPrimaryActivity(db,organization.id,data.cnaeFiscalCode,office.userId);
    return NextResponse.json({organization},{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Revise os campos obrigatórios e os formatos informados."},{status:400});
    logEvent("error","ORGANIZATION_CREATE_FAILED",{error:error instanceof Error?`${error.name}: ${error.message}`:String(error)});
    return NextResponse.json({error:"Não foi possível criar a empresa. O CNPJ já pode estar cadastrado."},{status:422});
  }
}

export async function PATCH(request:Request){
  try{
    const office=await requireOfficeSession();
    const input=organizationInput.extend({id:z.string().uuid()}).parse(await request.json());
    const {id,...data}=input;
    const db=createAdminClient();
    const {data:organization,error}=await db.from("organizations").update(toOrganizationPayload(data)).eq("id",id).select("id").maybeSingle();
    if(error)throw error;
    if(!organization)return NextResponse.json({error:"Empresa não encontrada."},{status:404});
    await linkPrimaryActivity(db,organization.id,data.cnaeFiscalCode,office.userId);
    return NextResponse.json({organization});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Revise os campos obrigatórios e os formatos informados."},{status:400});
    logEvent("error","ORGANIZATION_UPDATE_FAILED",{error:error instanceof Error?`${error.name}: ${error.message}`:String(error)});
    return NextResponse.json({error:"Não foi possível atualizar o cadastro da empresa."},{status:422});
  }
}
