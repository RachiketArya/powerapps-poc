/**
 * Refund review — the app Finance Ops owns and Payments Engineering reviews.
 * It rides the shared ReviewSurface and the trusted decision kernel; the
 * workflow-specific part is the payment ledger inspection and the creation
 * form's payment picker, which has no meaning for other workflows.
 */
import { useEffect, useState } from "react";
import { ApiError, api, fieldLabel, fieldValue, formatCents, type CatalogApp, type Payment, type RecordDetail, type Actor } from "../api";
import { ReviewSurface } from "./shared";

export function RefundReviewApp({ app, actor }: { app: CatalogApp; actor: Actor }) {
  return (
    <ReviewSurface
      app={app}
      actor={actor}
      renderInspection={(record) => <PaymentLedger record={record} />}
      renderCreateForm={(appId, onCreated) => <RefundCreateForm appId={appId} onCreated={onCreated} />}
    />
  );
}

/** The numbers an approver needs next to a refund decision, in one card. */
function PaymentLedger({ record }: { record: RecordDetail }) {
  const requested = Number(record.amount_cents ?? 0);
  const remaining = record.remaining_refundable_cents;
  // Only a pending request can still be subtracted — for a decided record
  // `remaining` already reflects the decision and a projection would be
  // stale by exactly this request's amount.
  const pending = record.status === "pending";
  const projected = pending && typeof remaining === "number" ? remaining - requested : null;
  const currency = typeof record.payment_currency === "string" ? record.payment_currency : undefined;

  return (
    <div className="inspection">
      <h3>Payment ledger</h3>
      <dl className="fields compact">
        <div>
          <dt>Payment</dt>
          <dd>{fieldValue(record, "payment_reference")}</dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>{fieldValue(record, "customer_label")}</dd>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>{formatCents(Number(record.payment_amount_cents ?? 0), currency)}</dd>
        </div>
        <div>
          <dt>Remaining refundable</dt>
          <dd>{typeof remaining === "number" ? formatCents(remaining, currency) : "—"}</dd>
        </div>
        <div>
          <dt>This request</dt>
          <dd>{formatCents(requested, currency)}</dd>
        </div>
        {pending && (
          <div>
            <dt>Remaining after approval</dt>
            <dd className={projected !== null && projected < 0 ? "denied-text" : undefined}>
              {projected === null ? "—" : projected < 0 ? "would exceed the balance" : formatCents(projected, currency)}
            </dd>
          </div>
        )}
      </dl>
      <p className="muted small">
        Approvals may never exceed the remaining refundable balance; the kernel re-checks this inside the decision
        transaction.
      </p>
    </div>
  );
}

function RefundCreateForm({ appId, onCreated }: { appId: string; onCreated: (id: string) => Promise<void> }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.payments(appId).then((res) => {
      setPayments(res.payments);
      setForm((f) => ({ ...f, paymentId: f.paymentId ?? res.payments[0]?.id ?? "" }));
    });
  }, [appId]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createRecord(appId, {
        paymentId: form.paymentId ?? "",
        amountCents: Number(form.amount ?? ""),
        reason: form.reason ?? "",
      });
      await onCreated(res.record.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The request could not be created.");
    } finally {
      setBusy(false);
    }
  }

  const selected = payments.find((p) => p.id === form.paymentId);

  return (
    <form
      className="create"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label>
        <span>Payment</span>
        <select value={form.paymentId ?? ""} onChange={(e) => set("paymentId", e.target.value)}>
          {payments.map((p) => (
            <option key={p.id} value={p.id}>
              {p.reference} · {formatCents(p.amount_cents, p.currency)} ·{" "}
              {formatCents(p.remaining_refundable_cents, p.currency)} refundable
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Amount in cents</span>
        <input value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value)} inputMode="numeric" />
      </label>
      {selected && <p className="muted small">{fieldLabel("remaining_refundable_cents")}: {formatCents(selected.remaining_refundable_cents, selected.currency)}</p>}
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
