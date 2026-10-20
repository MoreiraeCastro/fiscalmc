import { notFound, redirect } from "next/navigation";
import { requireOfficeDataClient } from "@/lib/auth/session";

// A nota agora abre no Visualizar do Portal Contribuinte (com a empresa dela escolhida no seletor).
export default async function AdminInvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const db = await requireOfficeDataClient().catch(() => null);
  if (!db) redirect("/contribuinte");
  const { id } = await params;
  const { data: invoice } = await db.from("invoices").select("id,organization_id").eq("id", id).maybeSingle();
  if (!invoice) notFound();
  redirect(`/contribuinte/usar/${invoice.organization_id}?voltar=${encodeURIComponent(`/contribuinte/nfse/${invoice.id}`)}`);
}
