import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { BASE_PATH } from "@/lib/base-path";

// Inter auto-hospedada no build (como no portal-hub): a fonte sai do próprio domínio, sem CDN de terceiro.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "Moreira & Castro", template: "%s | Moreira & Castro" },
  description: "Emissão simples e segura de NFS-e.",
  applicationName: "Moreira & Castro",
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${BASE_PATH}/favicon-64.png`, sizes: "64x64", type: "image/png" }],
    apple: [{ url: `${BASE_PATH}/icon-192.png`, sizes: "192x192", type: "image/png" }]
  },
  appleWebApp: { capable: true, title: "Moreira & Castro", statusBarStyle: "default" }
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f172a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={inter.variable}><body>{children}<ServiceWorkerRegistration /></body></html>;
}
