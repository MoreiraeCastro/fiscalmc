import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveIssuanceContextFromMemberships, type IssuanceContext } from "@/lib/auth/issuance-context";

export type SessionOrganization={organizationId:string;role:"SUPER_ADMIN"|"OFFICE_STAFF"|"CLIENT_USER";userId:string};
type AuthenticatedUser={id:string;email:string|null;displayName:string};

function optionalClaimString(value:unknown){
  return typeof value==="string"&&value.trim()?value.trim():null;
}

const getAuthenticatedClient=cache(async()=>{
  const client=await createClient();
  if(!client)return{client:null,user:null,clientOrganizationId:null};
  // getClaims verifies the signed JWT locally when Supabase uses asymmetric
  // signing keys. This avoids an Auth server round-trip on every navigation.
  const {data,error}=await client.auth.getClaims();
  const claims=data?.claims;
  const id=optionalClaimString(claims?.sub);
  if(error||!id)return{client,user:null,clientOrganizationId:null};
  const email=optionalClaimString(claims?.email);
  const metadata=claims?.user_metadata;
  const fullName=metadata&&typeof metadata==="object"&&!Array.isArray(metadata)
    ?optionalClaimString((metadata as Record<string,unknown>).full_name)
    :null;
  const user:AuthenticatedUser={id,email,displayName:fullName??email??"Usuário"};
  // client_accesses issues CLIENT_USER tokens with organization_id baked into
  // app_metadata (see client-access-service.ts), so the common client page
  // load can skip the memberships round-trip entirely. Anything else (office
  // staff, who can hold multiple memberships) still resolves via the DB below.
  const appMetadata=claims?.app_metadata;
  const clientOrganizationId=appMetadata&&typeof appMetadata==="object"&&!Array.isArray(appMetadata)&&(appMetadata as Record<string,unknown>).account_type==="CLIENT_USER"
    ?optionalClaimString((appMetadata as Record<string,unknown>).organization_id)
    :null;
  return{client,user,clientOrganizationId};
});
const getActiveMemberships=cache(async(userId:string)=>{
  const {client}=await getAuthenticatedClient();
  if(!client)return{data:null,error:new Error("AUTH_CONFIGURATION_REQUIRED")};
  return client.from("memberships").select("organization_id,role").eq("user_id",userId).eq("active",true);
});
export async function requireSessionOrganization():Promise<SessionOrganization>{
  const {client,user,clientOrganizationId}=await getAuthenticatedClient();
  if(!client) throw new Error("AUTH_CONFIGURATION_REQUIRED");
  if(!user) throw new Error("UNAUTHENTICATED");
  if(clientOrganizationId)return{organizationId:clientOrganizationId,role:"CLIENT_USER",userId:user.id};
  const {data,error}=await getActiveMemberships(user.id);
  if(error||!data?.length) throw new Error("FORBIDDEN_ORGANIZATION");
  if(data.length>1) throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
  return {organizationId:data[0].organization_id,role:data[0].role,userId:user.id};
}

export async function requireIssuanceContext(requestedOrganizationId?:string):Promise<IssuanceContext>{
  const {client,user}=await getAuthenticatedClient();
  if(!client)throw new Error("AUTH_CONFIGURATION_REQUIRED");
  if(!user)throw new Error("UNAUTHENTICATED");
  const {data,error}=await getActiveMemberships(user.id);
  if(error||!data?.length)throw new Error("FORBIDDEN_ORGANIZATION");
  return resolveIssuanceContextFromMemberships({
    actorUserId:user.id,
    requestedOrganizationId,
    memberships:data.map((item)=>({organizationId:item.organization_id,role:item.role})),
  });
}

/** Server Components redirect unauthenticated visitors; API routes retain HTTP error responses. */
export async function requireClientPageSession():Promise<SessionOrganization>{
  try{return await requireSessionOrganization();}catch{redirect("/login");}
}

export type OfficeSession={userId:string;role:"SUPER_ADMIN"|"OFFICE_STAFF";displayName:string};
export async function requireOfficeSession():Promise<OfficeSession>{
  const {client,user}=await getAuthenticatedClient();
  if(!client)throw new Error("AUTH_CONFIGURATION_REQUIRED");
  if(!user)throw new Error("UNAUTHENTICATED");
  const {data:memberships,error}=await getActiveMemberships(user.id);
  const officeMemberships=memberships?.filter(item=>item.role==="SUPER_ADMIN"||item.role==="OFFICE_STAFF");
  if(error||!officeMemberships?.length)throw new Error("FORBIDDEN_OFFICE");
  return{userId:user.id,role:officeMemberships.some(item=>item.role==="SUPER_ADMIN")?"SUPER_ADMIN":"OFFICE_STAFF",displayName:user.displayName};
}

/**
 * Client scoped to the authenticated user's JWT. Use this for routine OFFICE
 * reads so that database RLS remains the authorization boundary. Operations
 * that genuinely require elevation must continue to use createAdminClient
 * explicitly from their server-only implementation.
 */
export async function requireOfficeDataClient(){
  await requireOfficeSession();
  const {client}=await getAuthenticatedClient();
  if(!client)throw new Error("AUTH_CONFIGURATION_REQUIRED");
  return client;
}

export async function getShellIdentity(){
  const {client,user}=await getAuthenticatedClient();
  if(!client)return null;
  if(!user)return null;
  const {data:memberships}=await getActiveMemberships(user.id);
  const office=memberships?.some(item=>item.role==="SUPER_ADMIN"||item.role==="OFFICE_STAFF")??false;
  return{displayName:user.displayName,canAccessOffice:office};
}

export type PortalSession={client:NonNullable<Awaited<ReturnType<typeof createClient>>>;userId:string;displayName:string;memberships:{organizationId:string;role:SessionOrganization["role"]}[]};
/** Portal Contribuinte: any signed-in user with at least one active membership (client or office). */
export async function requirePortalSession():Promise<PortalSession>{
  const {client,user}=await getAuthenticatedClient();
  if(!client||!user)redirect("/login");
  const {data}=await getActiveMemberships(user.id);
  if(!data?.length)redirect("/login");
  return{client,userId:user.id,displayName:user.displayName,memberships:data.map((item)=>({organizationId:item.organization_id,role:item.role}))};
}
