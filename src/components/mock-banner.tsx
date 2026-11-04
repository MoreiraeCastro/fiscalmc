import { TriangleAlert } from "@/components/icons";

export function MockBanner() {
  return <div className="mock-banner" role="status"><TriangleAlert size={22} aria-hidden /><div><strong>Ambiente de homologação (mock)</strong><span>Dados de teste, sem validade fiscal. Nenhuma emissão é enviada à SEFIN Nacional.</span></div></div>;
}
