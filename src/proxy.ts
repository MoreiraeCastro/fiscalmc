import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Refreshes the cookie-based Supabase session before protected Server
 * Components and Route Handlers run. Authorization remains enforced in each
 * page/handler through memberships and RLS; Proxy only maintains the session.
 */
export async function proxy(request:NextRequest){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return NextResponse.next({request});

  let response=NextResponse.next({request});
  const supabase=createServerClient(url,key,{
    cookies:{
      getAll:()=>request.cookies.getAll(),
      setAll:(cookiesToSet)=>{
        cookiesToSet.forEach(({name,value})=>request.cookies.set(name,value));
        response=NextResponse.next({request});
        cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options));
      },
    },
  });

  // Do not add application logic between client creation and token validation.
  await supabase.auth.getClaims();
  return response;
}

export const config={
  matcher:["/app/:path*","/admin/:path*","/contribuinte/:path*","/api/:path*"],
};
