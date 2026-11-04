import Link from "next/link";
import { ArrowRight, Inbox } from "@/components/icons";

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return <header className="v2-page-header">
    <div>
      {backHref && <Link className="v2-back-link" href={backHref}>← {backLabel ?? "Voltar"}</Link>}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
    {actions ? <div className="v2-page-actions">{actions}</div> : null}
  </header>;
}

export function MetricTile({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "warning" }) {
  return <div className={`v2-metric${tone === "warning" ? " is-warning" : ""}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    {hint ? <small>{hint}</small> : null}
  </div>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "success" | "warning" | "danger" | "info" | "neutral" }) {
  return <span className={`v2-badge v2-badge-${tone}`}>{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="v2-empty">
    <span className="v2-empty-icon"><Inbox size={22} aria-hidden /></span>
    <strong>{title}</strong>
    {description ? <p>{description}</p> : null}
    {action ? <div>{action}</div> : null}
  </div>;
}

export function TextAction({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link className="v2-text-action" href={href}>{children}<ArrowRight size={15} aria-hidden /></Link>;
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value.includes("T") ? value : `${value}T12:00:00`));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function formatTaxId(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
