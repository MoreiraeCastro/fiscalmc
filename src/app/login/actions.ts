"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { assertRateLimit } from "@/lib/security/rate-limit";
import { signInClientWithCnpj } from "@/lib/auth/client-login";
import { normalizeTaxId } from "@/lib/validation/identification";

export async function login(formData:FormData){
  const client=await createClient();
  if(!client) redirect("/login?error=configuration");
  const requestHeaders=await headers();
  const cnpj=String(formData.get("cnpj")??"");
  const source=requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown";
  try { assertRateLimit(`client-login:${source}:${normalizeTaxId(cnpj)}`,5,60_000); } catch { redirect("/login?error=rate_limited"); }
  let result;
  try { result=await signInClientWithCnpj(cnpj,String(formData.get("password")??""),async(email,password)=>!(await client.auth.signInWithPassword({email,password})).error); } catch { redirect("/login?error=invalid_credentials"); }
  if(!result.ok) redirect("/login?error=invalid_credentials");
  redirect("/contribuinte");
}
export async function requestPasswordReset(formData:FormData){const client=await createClient();if(client){const email=String(formData.get("email")??"");const appUrl=process.env.NEXT_PUBLIC_APP_URL??"http://localhost:3000";await client.auth.resetPasswordForEmail(email,{redirectTo:`${appUrl}/auth/callback?next=/nova-senha`});}redirect("/login?reset=sent");}
export async function logout(){const client=await createClient();await client?.auth.signOut();redirect("/login");}
