import { NextResponse } from "next/server";
import { appRedirectLocation } from "@/lib/base-path";
import { createClient } from "@/lib/supabase/server";

/** Volta do link de e-mail (login, recuperar senha): troca o código pela sessão e segue para `next`, só dentro do app. */
export async function GET(request:Request){
  const url=new URL(request.url);
  const code=url.searchParams.get("code");
  const next=url.searchParams.get("next")??"/contribuinte";
  const client=await createClient();
  if(code&&client)await client.auth.exchangeCodeForSession(code);
  return new NextResponse(null,{status:307,headers:{Location:appRedirectLocation(next.replace(/^\/emissor(?=\/)/,""))}});
}
