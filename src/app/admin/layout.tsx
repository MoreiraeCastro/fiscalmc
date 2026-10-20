import { redirect } from "next/navigation";
import { PortalShell } from "@/components/contribuinte/portal-shell";
import { EscritorioNav } from "@/components/contribuinte/escritorio-nav";
import { contextoContribuinte } from "@/lib/contribuinte/contexto";
import "../contribuinte/portal.css";

/** A área do escritório é a aba "Escritório" do Portal Contribuinte (mesma moldura, submenu próprio). */
export default async function OfficeAreaLayout({ children }: { children: React.ReactNode }) {
  const contexto = await contextoContribuinte();
  if (!contexto.escritorio) redirect("/contribuinte");
  return <PortalShell contexto={contexto}><EscritorioNav /><div className="pc-escritorio">{children}</div></PortalShell>;
}
