"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, MessageCircleWarning, Pencil, Plus, Send, X } from "@/components/icons";
import { StatusBadge, formatDateTime } from "@/components/ui-kit";
import { getClientServiceStatusLabel, type ServiceWorkflowStatus } from "@/lib/services/workflow";
import { apiUrl } from "@/lib/base-path";

export type ClientService = {
  id: string;
  name: string;
  default_description: string | null;
  client_service_location: string | null;
  client_note: string | null;
  needs_info_message: string | null;
  workflow_status: ServiceWorkflowStatus;
  created_at: string;
  updated_at: string;
};

type FormState = {
  name: string;
  defaultDescription: string;
  serviceLocationMode: "ORGANIZATION" | "OTHER";
  serviceLocation: string;
  clientNote: string;
};

const blank: FormState = { name: "", defaultDescription: "", serviceLocationMode: "ORGANIZATION", serviceLocation: "", clientNote: "" };

function tone(status: ServiceWorkflowStatus): "success" | "warning" | "info" | "neutral" {
  if (status === "REVIEWED") return "success";
  if (status === "NEEDS_INFO") return "warning";
  if (status === "PENDING_REVIEW") return "info";
  return "neutral";
}

function statusMessage(status: ServiceWorkflowStatus) {
  if (status === "DRAFT") return "Complete as informações e envie para validação.";
  if (status === "PENDING_REVIEW") return "A Moreira & Castro está analisando este serviço.";
  if (status === "NEEDS_INFO") return "Precisamos de uma informação antes de concluir a validação.";
  if (status === "REVIEWED") return "Este serviço está pronto para ser selecionado em uma emissão.";
  return "Este serviço não está disponível para emissão.";
}

export function ClientServiceManager({ initialServices }: { initialServices: ClientService[] }) {
  const [services, setServices] = useState(initialServices);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const current = useMemo(() => services.find((item) => item.id === editingId) ?? null, [editingId, services]);

  function openCreate() {
    setEditingId(null);
    setForm(blank);
    setError("");
    setOpen(true);
  }

  function openEdit(service: ClientService) {
    setEditingId(service.id);
    setForm({
      name: service.name,
      defaultDescription: service.default_description ?? "",
      serviceLocationMode: service.client_service_location ? "OTHER" : "ORGANIZATION",
      serviceLocation: service.client_service_location ?? "",
      clientNote: service.client_note ?? "",
    });
    setError("");
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setEditingId(null);
    setForm(blank);
    setError("");
  }

  function replace(service: ClientService) {
    setServices((rows) => {
      const exists = rows.some((item) => item.id === service.id);
      return exists ? rows.map((item) => item.id === service.id ? service : item) : [service, ...rows];
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, serviceLocation: form.serviceLocationMode === "OTHER" ? form.serviceLocation || null : null };
      const response = await fetch(apiUrl("/api/services"), {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { action: "update", id: editingId, ...payload } : payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o serviço.");
      replace(result.service);
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o serviço.");
    } finally {
      setSaving(false);
    }
  }

  async function submit(service: ClientService) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/services"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", id: service.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível enviar o serviço para validação.");
      replace(result.service);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o serviço para validação.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <section className="v2-client-service-intro v2-panel">
      <div><span className="eyebrow">SERVIÇOS DA EMPRESA</span><h2>Informe o serviço que você presta</h2><p>Cadastre as informações comerciais. A Moreira & Castro cuida da validação fiscal antes da primeira emissão.</p></div>
      <button className="button primary" type="button" onClick={openCreate}><Plus size={18} />Novo serviço</button>
    </section>
    {error && !open ? <p className="alert error">{error}</p> : null}
    <section className="v2-panel v2-client-services">
      <div className="v2-panel-heading"><div><h2>Meus serviços</h2><p>{services.length} serviço(s) cadastrado(s)</p></div></div>
      {services.length ? <div className="v2-client-service-list">{services.map((service) => <article key={service.id}>
        <span className={`v2-service-state-icon is-${service.workflow_status.toLowerCase()}`}>{service.workflow_status === "REVIEWED" ? <CheckCircle2 size={19} /> : service.workflow_status === "NEEDS_INFO" ? <MessageCircleWarning size={19} /> : <Clock3 size={19} />}</span>
        <div className="v2-client-service-copy"><div><h3>{service.name}</h3><StatusBadge tone={tone(service.workflow_status)}>{getClientServiceStatusLabel(service.workflow_status)}</StatusBadge></div><p>{service.default_description}</p><small>{statusMessage(service.workflow_status)} · Atualizado em {formatDateTime(service.updated_at)}</small>{service.workflow_status === "NEEDS_INFO" && service.needs_info_message ? <aside><strong>Informação solicitada</strong><p>{service.needs_info_message}</p></aside> : null}</div>
        <div className="v2-client-service-actions">{service.workflow_status !== "INACTIVE" ? <button className="button ghost compact" type="button" onClick={() => openEdit(service)}><Pencil size={15} />Editar</button> : null}{service.workflow_status === "DRAFT" || service.workflow_status === "NEEDS_INFO" ? <button className="button secondary compact" type="button" disabled={saving} onClick={() => submit(service)}><Send size={15} />{service.workflow_status === "NEEDS_INFO" ? "Reenviar" : "Enviar para validação"}</button> : null}</div>
      </article>)}</div> : <div className="v2-empty"><strong>Nenhum serviço cadastrado.</strong><p>Comece informando o primeiro serviço que sua empresa presta.</p><button className="button primary" type="button" onClick={openCreate}><Plus size={17} />Novo serviço</button></div>}
    </section>

    {open ? <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={editingId ? "Editar serviço" : "Novo serviço"}><form className="modal v2-client-service-modal" onSubmit={save}>
      <div className="modal-header"><div><span className="eyebrow">SEM CÓDIGOS FISCAIS</span><h2>{editingId ? "Editar serviço" : "Novo serviço"}</h2><p>Use a linguagem do dia a dia da sua empresa.</p></div><button className="icon-button" type="button" onClick={close} aria-label="Fechar"><X /></button></div>
      {current?.workflow_status === "REVIEWED" ? <div className="v2-client-review-warning"><MessageCircleWarning size={18} /><p>Alterar estas informações enviará o serviço para uma nova validação. Ele ficará temporariamente indisponível para emissão.</p></div> : null}
      <label>Nome do serviço<input required minLength={2} maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Consultoria contábil" /></label>
      <label>Descrição padrão<textarea required minLength={3} maxLength={1000} value={form.defaultDescription} onChange={(event) => setForm({ ...form, defaultDescription: event.target.value })} placeholder="Descreva de forma simples o serviço prestado." /></label>
      <label>Local habitual da prestação<select value={form.serviceLocationMode} onChange={(event) => setForm({ ...form, serviceLocationMode: event.target.value as FormState["serviceLocationMode"] })}><option value="ORGANIZATION">Município cadastrado da empresa</option><option value="OTHER">Outro município ou local</option></select></label>
      {form.serviceLocationMode === "OTHER" ? <label>Informe o local<input required minLength={2} maxLength={160} value={form.serviceLocation} onChange={(event) => setForm({ ...form, serviceLocation: event.target.value })} placeholder="Ex.: Rio de Janeiro/RJ" /><small>O escritório confirmará o enquadramento fiscal correspondente.</small></label> : null}
      <label>Observação para o escritório <em>opcional</em><textarea maxLength={1000} value={form.clientNote} onChange={(event) => setForm({ ...form, clientNote: event.target.value })} placeholder="Inclua algum detalhe que ajude a entender a prestação." /></label>
      {error ? <p className="alert error">{error}</p> : null}
      <div className="form-actions"><button className="button secondary" type="button" onClick={close}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar serviço"}<ArrowRight size={17} /></button></div>
    </form></div> : null}
  </>;
}
