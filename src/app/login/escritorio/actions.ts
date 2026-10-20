"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertRateLimit } from "@/lib/security/rate-limit";

export async function officeLogin(formData: FormData) {
  const client = await createClient();
  if (!client) redirect("/login/escritorio?error=configuration");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const requestHeaders = await headers();
  const source = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try { assertRateLimit(`office-login:${source}:${email}`, 5, 60_000); }
  catch { redirect("/login/escritorio?error=rate_limited"); }
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect("/login/escritorio?error=invalid_credentials");
  const { data: memberships } = await client.from("memberships").select("role,active").eq("user_id", data.user.id).eq("active", true);
  if (!memberships?.some((item) => item.role === "SUPER_ADMIN" || item.role === "OFFICE_STAFF")) {
    await client.auth.signOut();
    redirect("/login/escritorio?error=invalid_credentials");
  }
  redirect("/contribuinte");
}
