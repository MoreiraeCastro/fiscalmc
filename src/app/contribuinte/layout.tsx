import { PortalShell } from "@/components/contribuinte/portal-shell";
import { contextoContribuinte } from "@/lib/contribuinte/contexto";
import "./portal.css";

export const metadata = { title: { default: "Portal Contribuinte", template: "%s | Portal Contribuinte" } };

export default async function ContribuinteLayout({ children }: { children: React.ReactNode }) {
  const contexto = await contextoContribuinte();
  return <PortalShell contexto={contexto}>{children}</PortalShell>;
}
