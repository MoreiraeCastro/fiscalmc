"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Search, X } from "@/components/icons";
import { apiUrl } from "@/lib/base-path";

type Customer = {
  id: string;
  person_type: "INDIVIDUAL" | "COMPANY" | "FOREIGN";
  tax_id: string | null;
  legal_name: string;
  email?: string | null;
  phone?: string | null;
  postal_code?: string | null;
  street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  neighborhood?: string | null;
  municipality_code?: string | null;
  state?: string | null;
};

const blank = {
  personType: "COMPANY" as Customer["person_type"],
  legalName: "",
  taxId: "",
  email: "",
  phone: "",
  postalCode: "",
  street: "",
  addressNumber: "",
  addressComplement: "",
  neighborhood: "",
  municipalityCode: "",
  state: "",
};

export function CustomerManager() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(blank);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNotice, setLookupNotice] = useState("");

  async function load(search = "") {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/customers?q=${encodeURIComponent(search)}`));
      const data = await response.json();
      if (response.ok) setRows(data.customers ?? []);
      else setError(data.error ?? "Não foi possível carregar os tomadores.");
    } catch {
      setError("Não foi possível carregar os tomadores.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(query), 180);
    return () => clearTimeout(timer);
  }, [query]);

  function close() {
    setOpen(false);
    setEditingId(null);
    setForm(blank);
    setLookupNotice("");
  }

  function edit(customer: Customer) {
    setEditingId(customer.id);
    setLookupNotice("");
    setForm({
      personType: customer.person_type,
      legalName: customer.legal_name,
      taxId: customer.tax_id ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      postalCode: customer.postal_code ?? "",
      street: customer.street ?? "",
      addressNumber: customer.address_number ?? "",
      addressComplement: customer.address_complement ?? "",
      neighborhood: customer.neighborhood ?? "",
      municipalityCode: customer.municipality_code ?? "",
      state: customer.state ?? "",
    });
    setOpen(true);
  }

  async function lookupCnpj() {
    const cnpj = form.taxId.replace(/\D/g, "");
    if (cnpj.length !== 14) return;
    setLookingUp(true);
    setLookupNotice("");
    try {
      const response = await fetch(apiUrl(`/api/customers/lookup-cnpj?cnpj=${cnpj}`));
      const data = await response.json();
      if (!response.ok) {
        setLookupNotice(data.error ?? "Não foi possível consultar o CNPJ.");
        return;
      }
      const found = data.customer;
      setForm((current) => ({
        ...current,
        legalName: found.legalName || current.legalName,
        email: found.email || current.email,
        phone: found.phone || current.phone,
        postalCode: found.postalCode || current.postalCode,
        street: found.street || current.street,
        addressNumber: found.addressNumber || current.addressNumber,
        addressComplement: found.addressComplement || current.addressComplement,
        neighborhood: found.neighborhood || current.neighborhood,
        municipalityCode: found.municipalityCode || current.municipalityCode,
        state: found.state || current.state,
      }));
      setLookupNotice(
        found.situacaoCadastral && found.situacaoCadastral !== "ATIVA"
          ? `Atenção: situação cadastral "${found.situacaoCadastral}".`
          : "Dados preenchidos a partir do CNPJ. Revise antes de salvar.",
      );
    } catch {
      setLookupNotice("Não foi possível consultar o CNPJ agora.");
    } finally {
      setLookingUp(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/customers"), {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...form } : form)
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Não foi possível salvar o tomador.");
        return;
      }
      close();
      await load(query);
    } catch {
      setError("Não foi possível salvar o tomador.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="section">
    <div className="section-toolbar">
      <label className="search-field"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome, CPF ou CNPJ" /></label>
      <button className="button primary" type="button" onClick={() => { close(); setOpen(true); }}><Plus size={18} />Novo tomador</button>
    </div>
    {error && <p className="alert error">{error}</p>}
    {loading ? <div className="empty-state">Carregando tomadores…</div> : rows.length ? <div>{rows.map(customer => <div className="service-row" key={customer.id}>
      <div><strong>{customer.legal_name}</strong><span>{customer.tax_id ?? "Documento não informado"} · {customer.person_type === "COMPANY" ? "Pessoa jurídica" : customer.person_type === "INDIVIDUAL" ? "Pessoa física" : "Estrangeiro"}</span></div>
      <button className="button ghost" type="button" onClick={() => edit(customer)}><Pencil size={16} />Editar</button>
    </div>)}</div> : <div className="empty-state"><strong>Nenhum tomador cadastrado.</strong><p>Adicione um tomador para iniciar uma emissão.</p></div>}
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={editingId ? "Editar tomador" : "Novo tomador"}>
      <form className="modal service-form" onSubmit={save}>
        <div className="modal-header"><h2>{editingId ? "Editar tomador" : "Novo tomador"}</h2><button className="icon-button" type="button" onClick={close} aria-label="Fechar"><X /></button></div>
        <label>Tipo<select value={form.personType} onChange={event => setForm({ ...form, personType: event.target.value as Customer["person_type"] })}><option value="COMPANY">Pessoa jurídica</option><option value="INDIVIDUAL">Pessoa física</option><option value="FOREIGN">Estrangeiro</option></select></label>
        <label>Nome ou razão social<input required value={form.legalName} onChange={event => setForm({ ...form, legalName: event.target.value })} /></label>
        <div className="v2-form-grid">
          <label>CPF ou CNPJ<input value={form.taxId} onChange={event => setForm({ ...form, taxId: event.target.value })} /></label>
          {form.personType === "COMPANY" && (
            <label>&nbsp;<button className="button secondary" type="button" disabled={lookingUp || form.taxId.replace(/\D/g, "").length !== 14} onClick={lookupCnpj}>{lookingUp ? "Buscando…" : "Buscar CNPJ"}</button></label>
          )}
        </div>
        {lookupNotice && <p className="alert">{lookupNotice}</p>}
        <div className="v2-form-grid">
          <label>E-mail<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
          <label>Telefone<input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label>
        </div>
        <label>Endereço<input value={form.street} onChange={event => setForm({ ...form, street: event.target.value })} /></label>
        <div className="v2-form-grid">
          <label>Número<input value={form.addressNumber} onChange={event => setForm({ ...form, addressNumber: event.target.value })} /></label>
          <label>Complemento<input value={form.addressComplement} onChange={event => setForm({ ...form, addressComplement: event.target.value })} /></label>
        </div>
        <div className="v2-form-grid">
          <label>Bairro<input value={form.neighborhood} onChange={event => setForm({ ...form, neighborhood: event.target.value })} /></label>
          <label>CEP<input value={form.postalCode} onChange={event => setForm({ ...form, postalCode: event.target.value })} /></label>
        </div>
        <div className="v2-form-grid">
          <label>Município (código IBGE)<input value={form.municipalityCode} onChange={event => setForm({ ...form, municipalityCode: event.target.value })} /></label>
          <label>UF<input value={form.state} maxLength={2} onChange={event => setForm({ ...form, state: event.target.value.toUpperCase() })} /></label>
        </div>
        <div className="form-actions"><button className="button secondary" type="button" onClick={close}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar tomador"}</button></div>
      </form>
    </div>}
  </section>;
}
