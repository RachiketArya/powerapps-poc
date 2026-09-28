/**
 * Vendor bank-change review — Finance Ops owns it, Treasury Engineering
 * reviews it. Shares the ReviewSurface and the trusted kernel; what is
 * genuinely workflow-specific is the account-change inspection: current vs
 * proposed masked reference side by side and a verification checklist an
 * approver can read at a glance. None of these controls weaken the rules —
 * the server refuses an unverifiable-channel approval regardless.
 */
import { useState } from "react";
import { ApiError, api, fieldValue, type Actor, type CatalogApp, type RecordDetail } from "../api";
import { ReviewSurface } from "./shared";

const CHANNEL_LABEL: Record<string, string> = {
  callback_to_known_number: "Callback to known number",
  portal_message: "Vendor portal message",
  inbound_email_only: "Inbound email only",
};

export function VendorBankChangeApp({ app, actor }: { app: CatalogApp; actor: Actor }) {
  return (
    <ReviewSurface
      app={app}
      actor={actor}
      renderInspection={(record) => <ChangeInspection record={record} />}
      renderCreateForm={(appId, onCreated) => <VendorCreateForm appId={appId} onCreated={onCreated} />}
    />
  );
}

function ChangeInspection({ record }: { record: RecordDetail }) {
  const channel = String(record.verification_channel ?? "");
  const unverifiable = channel === "inbound_email_only";

  const checks = [
    {
      label: "Independent verification channel",
      ok: !unverifiable,
      detail: unverifiable
        ? "Inbound email alone can never support an approval — callback to a known number is required."
        : `${CHANNEL_LABEL[channel] ?? channel} is an acceptable channel.`,
    },
    {
      label: "Account reference actually changed",
      ok: record.current_masked_ref !== record.new_masked_ref,
      detail:
        record.current_masked_ref === record.new_masked_ref
          ? "The proposed reference is identical to the current one."
          : "Proposed reference differs from the current one.",
    },
    {
      label: "Reason on file",
      ok: String(record.reason ?? "").trim().length >= 5,
      detail: "Requester supplied a reason for the change.",
    },
  ];

  return (
    <div className="inspection">
      <h3>Bank detail change</h3>
      <div className="compare">
        <div>
          <span className="muted small">Current (masked)</span>
          <code>{fieldValue(record, "current_masked_ref")}</code>
        </div>
        <span aria-hidden>→</span>
        <div>
          <span className="muted small">Proposed (masked)</span>
          <code>{fieldValue(record, "new_masked_ref")}</code>
        </div>
      </div>
      <ul className="checklist">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "success-text" : "denied-text"}>
            <strong>{c.label}</strong>
            <span className="muted"> — {c.detail}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        The server independently refuses approval on unverifiable channels and requires a 20-character approval
        narrative describing the verification performed.
      </p>
    </div>
  );
}

function VendorCreateForm({ appId, onCreated }: { appId: string; onCreated: (id: string) => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createRecord(appId, {
        vendorName: form.vendorName ?? "",
        currentMaskedRef: form.currentMaskedRef ?? "",
        newMaskedRef: form.newMaskedRef ?? "",
        country: (form.country ?? "").toUpperCase(),
        verificationChannel: form.verificationChannel ?? "callback_to_known_number",
        reason: form.reason ?? "",
      });
      await onCreated(res.record.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The request could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="create"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label>
        <span>Vendor</span>
        <input value={form.vendorName ?? ""} onChange={(e) => set("vendorName", e.target.value)} />
      </label>
      <label>
        <span>Current account (masked)</span>
        <input
          value={form.currentMaskedRef ?? ""}
          onChange={(e) => set("currentMaskedRef", e.target.value)}
          placeholder="••••-••••-3312"
        />
      </label>
      <label>
        <span>New account (masked)</span>
        <input
          value={form.newMaskedRef ?? ""}
          onChange={(e) => set("newMaskedRef", e.target.value)}
          placeholder="••••-••••-8890"
        />
      </label>
      <label>
        <span>Country</span>
        <input value={form.country ?? ""} onChange={(e) => set("country", e.target.value)} placeholder="US" />
      </label>
      <label>
        <span>Verification channel</span>
        <select
          value={form.verificationChannel ?? "callback_to_known_number"}
          onChange={(e) => set("verificationChannel", e.target.value)}
        >
          <option value="callback_to_known_number">callback to known number</option>
          <option value="portal_message">portal message</option>
          <option value="inbound_email_only">inbound email only</option>
        </select>
      </label>
      <label className="grow">
        <span>Reason</span>
        <input value={form.reason ?? ""} onChange={(e) => set("reason", e.target.value)} />
      </label>
      <button type="submit" disabled={busy}>
        Create request
      </button>
      {error && <p className="notice denied">{error}</p>}
    </form>
  );
}
