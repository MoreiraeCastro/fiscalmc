"use client";
import { useState } from "react";
import { Copy, KeyRound, LockKeyhole, RotateCcw, ShieldCheck, UserRoundPlus } from "lucide-react";
import { apiUrl } from "@/lib/base-path";

type Access = { cnpj: string; status: "ACTIVE" | "BLOCKED" | "INVALID"; createdAt: string; blockedAt: string | null };
type AccessResult = { access: Access | null; readiness: { ready: boolean; status: string; message: string } };
type Mode = "CREATE" | "RESET" | "REPAIR";

/**
 * Acesso do cliente ao portal (CNPJ + senha). "Gerar acesso" / "Gerar nova senha": o servidor cria uma senha forte e ela aparece
 * uma única vez, com uma mensagem pronta para mandar ao cliente. Definir a senha à mão continua possível.
 */
export function ClientAccessManager({ organizationId, organizationTaxId, initial, canWrite }: { organizationId: string; organizationTaxId: string; initial: AccessResult; canWrite: boolean }) {
  const [result, setResult] = useState(initial);
  const [manual, setManual] = useState<Mode | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState<"SENHA" | "MENSAGEM" | null>(null);

  async function request(method: "POST" | "PATCH", body: Record<string, string | boolean>) {
    setSaving(true); setError(null); setNotice(null); setGenerated(null); setCopied(null);
    try {
      const response = await fetch(apiUrl(`/api/admin/organizations/${organizationId}/client-access`), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as AccessResult & { error?: string; generatedPassword?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar o acesso.");
      const { generatedPassword, ...summary } = payload;
      setResult(summary); setPassword(""); setConfirmPassword(""); setManual(null);
      if (generatedPassword) setGenerated(generatedPassword);
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível atualizar o acesso.");
      return false;
    } finally { setSaving(false); }
  }

  async function generate(mode: Mode) {
    if (mode === "RESET" && !window.confirm("Gerar uma nova senha? A senha atual do cliente deixa de funcionar.")) return;
    const ok = mode === "CREATE" ? await request("POST", { generate: true }) : await request("PATCH", { action: mode === "REPAIR" ? "REPAIR_GENERATED" : "RESET_PASSWORD_GENERATED" });
    if (ok) setNotice(mode === "CREATE" ? "Acesso criado." : mode === "REPAIR" ? "Acesso do cliente reparado." : "Nova senha gerada.");
  }

  async function submitManual() {
    if (!manual) return;
    if (password.length < 8) { setError("A senha deve ter pelo menos 8 caracteres."); return; }
    if (password !== confirmPassword) { setError("As senhas não coincidem."); return; }
    const body: Record<string, string> = manual === "CREATE" ? { password, confirmPassword } : { action: manual === "REPAIR" ? "REPAIR" : "RESET_PASSWORD", password, confirmPassword };
    if (await request(manual === "CREATE" ? "POST" : "PATCH", body)) setNotice(manual === "CREATE" ? "Acesso criado com sucesso." : manual === "REPAIR" ? "Acesso do cliente reparado com sucesso." : "Senha redefinida com sucesso.");
  }

  async function changeState(action: "BLOCK" | "REACTIVATE") {
    if (action === "BLOCK" && !window.confirm("Bloquear este acesso agora? O cliente deixará de acessar a área da empresa.")) return;
    if (await request("PATCH", { action })) setNotice(action === "BLOCK" ? "Acesso bloqueado." : "Acesso reativado.");
  }

  async function copy(texto: string, qual: "SENHA" | "MENSAGEM") {
    try { await navigator.clipboard.writeText(texto); setCopied(qual); } catch { setCopied(null); }
  }

  const access = result.access;
  const cnpj = formatCnpj(access?.cnpj || organizationTaxId);
  const portal = typeof window === "undefined" ? "" : `${window.location.origin}${apiUrl("/login")}`;
  const mensagem = generated ? `Acesso ao portal de notas fiscais da Moreira & Castro\nPortal: ${portal}\nCNPJ: ${cnpj}\nSenha: ${generated}` : "";
  const primary: Mode | null = !access ? "CREATE" : access.status === "INVALID" ? "REPAIR" : null;

  return <section className="client-access-manager">
    <div className="client-access-header"><div><p className="eyebrow">Acesso do cliente</p><h2>{access ? result.readiness.message : "Nenhum acesso cadastrado."}</h2><p>Opcional: só se o cliente for emitir pelo portal. Ele entra com o CNPJ e uma senha.</p></div>{access?.status === "ACTIVE" ? <ShieldCheck className="client-access-icon valid" /> : <LockKeyhole className="client-access-icon" />}</div>
    {access && <dl className="client-access-details">
      <div><dt>CNPJ</dt><dd>{cnpj}</dd></div>
      <div><dt>Status</dt><dd><span className={`status ${access.status === "ACTIVE" ? "" : "warning"}`}>{access.status === "ACTIVE" ? "Ativo" : access.status === "BLOCKED" ? "Bloqueado" : "Requer revisão"}</span></dd></div>
      <div><dt>Criado em</dt><dd>{formatDate(access.createdAt)}</dd></div>
      <div><dt>Senha</dt><dd>Protegida pelo Supabase Auth</dd></div>
    </dl>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    {error && <p className="alert error" role="alert">{error}</p>}
    {generated ? <div className="client-access-generated" role="status">
      <strong>Senha gerada: anote ou envie agora. Ela não será mostrada de novo.</strong>
      <div className="client-access-generated-line"><code>{generated}</code><button className="button ghost" type="button" onClick={() => copy(generated, "SENHA")}><Copy size={16} />{copied === "SENHA" ? "Copiada" : "Copiar senha"}</button></div>
      <textarea className="input" readOnly rows={4} value={mensagem} aria-label="Mensagem para o cliente" />
      <button className="button secondary" type="button" onClick={() => copy(mensagem, "MENSAGEM")}><Copy size={16} />{copied === "MENSAGEM" ? "Mensagem copiada" : "Copiar mensagem para o cliente"}</button>
    </div> : null}
    {!canWrite && <p className="client-access-note">Seu perfil pode consultar o status, mas somente superadministradores podem alterar o acesso.</p>}
    {canWrite && primary && !manual && <div className="client-access-actions">
      <button className="button primary" type="button" onClick={() => generate(primary)} disabled={saving}><UserRoundPlus size={18} />{saving ? "Gerando…" : primary === "CREATE" ? "Gerar acesso" : "Reparar e gerar senha"}</button>
      <button className="button ghost" type="button" onClick={() => { setManual(primary); setError(null); }}>Definir a senha manualmente</button>
    </div>}
    {canWrite && manual && <div className="client-access-password-form">
      <div><strong>{manual === "CREATE" ? "Criar acesso com senha definida" : manual === "REPAIR" ? "Reparar acesso do cliente" : "Redefinir senha"}</strong><p>{manual === "CREATE" ? `O acesso será criado para o CNPJ ${formatCnpj(organizationTaxId)}.` : manual === "REPAIR" ? "Uma nova identidade CLIENT_USER será criada. O acesso administrativo atual será preservado." : "A senha atual não será exibida nem recuperada."}</p></div>
      <label>Nova senha<input className="input" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} /></label>
      <label>Confirmar senha<input className="input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} /></label>
      <div className="client-access-form-actions"><button className="button ghost" type="button" onClick={() => { setManual(null); setError(null); }}>Cancelar</button><button className="button primary" type="button" onClick={submitManual} disabled={saving}><UserRoundPlus size={18}/>{saving ? "Salvando…" : manual === "CREATE" ? "Criar acesso" : manual === "REPAIR" ? "Criar acesso CLIENT_USER" : "Salvar nova senha"}</button></div>
    </div>}
    {canWrite && access && access.status !== "INVALID" && !manual && <div className="client-access-actions">
      {access.status === "ACTIVE" ? <button className="button secondary" type="button" onClick={() => changeState("BLOCK")} disabled={saving}><LockKeyhole size={17}/>Bloquear acesso</button> : <button className="button primary" type="button" onClick={() => changeState("REACTIVATE")} disabled={saving}><RotateCcw size={17}/>Reativar acesso</button>}
      <button className="button ghost" type="button" onClick={() => generate("RESET")} disabled={saving}><KeyRound size={17}/>Gerar nova senha</button>
      <button className="button ghost" type="button" onClick={() => { setManual("RESET"); setError(null); setNotice(null); setGenerated(null); }}>Definir senha manualmente</button>
    </div>}
  </section>;
}

function formatCnpj(value: string) { const digits = value.replace(/\D/g, ""); return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : value; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value)); }
