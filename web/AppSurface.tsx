import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  api,
  fieldLabel,
  fieldValue,
  formatCents,
  formatTime,
  STATUS_LABEL,
  type Actor,
  type CatalogApp,
  type Payment,
  type RecordDetail,
  type RecordSummary,
} from "./api";

/**
 * One review surface used by both shipped apps. The definition chooses the
 * labels, the columns and which capabilities are offered; every rule applied
 * to a decision lives on the server.
 */
export function AppSurface({ app, actor }: { app: CatalogApp; actor: Actor }) {
  const definition = app.definition!;
  const [status, setStatus] = useState("pending");
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const canCreate = definition.capabilities.includes("record.create");
  const isRefund = app.workflow?.entityType === "refund_request";

  const loadList = useCallback(async () => {
    try {
      const res = await api.records(definition.appId, { status, q: query });
      setRecords(res.records);
      setListError(null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Could not load the queue");
      setRecords([]);
    }
  }, [definition.appId, status, query]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(
    async (id: string) => {
      const res = await api.record(definition.appId, id);
      setDetail(res.record);
    },
    [definition.appId],
  );

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function afterChange(id: string) {
    setSelectedId(id);
    await loadDetail(id);
    await loadList();
  }

  return (
    <div className="surface">
      <header className="surface-head">
        <div>
          <h1>{definition.labels.queueTitle}</h1>
          <p className="muted">{definition.summary}</p>
        </div>
        <dl className="surface-meta">
          <div>
            <dt>Definition</dt>
            <dd>
              v{app.version} · <code>{app.digest}</code>
            </dd>
          </div>
          <div>
            <dt>Connector</dt>
            <dd>{definition.connectorId}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>
              {definition.owner.team} {definition.owner.contactHandle}
            </dd>
          </div>
        </dl>
      </header>

      <div className="surface-body">
        <section className="queue">
          <div className="queue-controls">
            <label>
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="pending">Pending review</option>
                <option value="approved_for_execution">Approved for execution</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label className="grow">
              <span>Search</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Reference, vendor or reason"
              />
            </label>
            {canCreate && (
              <button type="button" className="secondary" onClick={() => setCreating((v) => !v)}>
                {creating ? "Close form" : "New request"}
              </button>
            )}
          </div>

          {creating && canCreate && (
            <CreateForm
              appId={definition.appId}
              isRefund={isRefund}
              onCreated={async (id) => {
                setCreating(false);
                setQuery("");
                setStatus("pending");
                await afterChange(id);
              }}
            />
          )}

          {listError && <p className="notice denied">{listError}</p>}

          <table className="records">
            <thead>
              <tr>
                {definition.view.listFields.map((f) => (
                  <th key={f}>{fieldLabel(f)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr
                  key={r.id}
                  className={r.id === selectedId ? "selected" : undefined}
                  onClick={() => setSelectedId(r.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(r.id);
                    }
                  }}
                >
                  {definition.view.listFields.map((f) => (
                    <td key={f}>{fieldValue(r, f)}</td>
                  ))}
                </tr>
              ))}
              {records.length === 0 && !listError && (
                <tr>
                  <td colSpan={definition.view.listFields.length} className="muted">
                    {definition.labels.emptyState}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <aside className="detail">
          {!detail && <p className="muted">Select a row to review it.</p>}
          {detail && (
            <DetailPanel
              key={detail.id}
              app={app}
              actor={actor}
              record={detail}
              onDecided={() => afterChange(detail.id)}
              onRefresh={() => afterChange(detail.id)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function DetailPanel({
  app,
  actor,
  record,
  onDecided,
  onRefresh,
}: {
  app: CatalogApp;
  actor: Actor;
  record: RecordDetail;
  onDecided: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const definition = app.definition!;
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useMemo(() => `${record.id}-${record.version}-${Math.random().toString(36).slice(2, 10)}`, [
    record.id,
    record.version,
  ]);

  const decidable = record.status === "pending";
  const isOwnRequest = record.requested_by === actor.id;
  const canDecide = (app.workflow?.decisionRoles ?? []).includes(actor.role);

  let blockedBecause: string | null = null;
  if (!decidable) blockedBecause = `This request is already ${STATUS_LABEL[record.status] ?? record.status}.`;
  else if (!canDecide) blockedBecause = `Your demo role (${actor.role}) may read this queue but not decide on it.`;
  else if (isOwnRequest) blockedBecause = "You raised this request. Separation of duties requires a different approver.";

  async function submit(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.decide(definition.appId, record.id, {
        decision,
        reason,
        expectedVersion: record.version,
        idempotencyKey,
      });
      setNotice(res.note);
      setReason("");
      await onDecided();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The decision could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="detail-head">
        <h2>{record.id}</h2>
        <button
          type="button"
          className="secondary"
          onClick={async () => {
            setError(null);
            setNotice(null);
            await onRefresh();
          }}
        >
          Refresh
        </button>
      </div>

      <dl className="fields">
        {definition.view.detailFields.map((f) => (
          <div key={f}>
            <dt>{fieldLabel(f)}</dt>
            <dd>{fieldValue(record, f)}</dd>
          </div>
        ))}
      </dl>

      {error && <p className="notice denied">{error}</p>}
      {notice && <p className="notice success">{notice}</p>}

      {blockedBecause ? (
        <p className="notice muted-notice">{blockedBecause}</p>
      ) : (
        <form
          className="decision"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <label>
            <span>Decision reason (recorded in the audit trail)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </label>
          <div className="actions">
            <button type="button" className="approve" disabled={busy} onClick={() => submit("approve")}>
              {definition.labels.approveAction}
            </button>
            <button type="button" className="reject" disabled={busy} onClick={() => submit("reject")}>
              {definition.labels.rejectAction}
            </button>
          </div>
          <p className="muted small">
            Approval marks the record approved for execution. Nothing is paid, moved or updated anywhere.
          </p>
        </form>
      )}

      <h3>Audit trail</h3>
      {!record.events && (
        <p className="muted small">
          This app definition does not request the audit.read capability, so the runtime does not return record history
          to it.
        </p>
      )}
      <ol className="timeline">
        {(record.events ?? []).map((e) => (
          <li key={e.id}>
            <span className="when">{formatTime(e.created_at)}</span>
            <span>
              <strong>{e.action}</strong> by {e.actor_name ?? e.actor_id} ({e.actor_role})
              {e.to_status ? ` → ${STATUS_LABEL[e.to_status] ?? e.to_status}` : ""}
            </span>
            {e.reason && <span className="muted">{e.reason}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function CreateForm({
  appId,
  isRefund,
  onCreated,
}: {
  appId: string;
  isRefund: boolean;
  onCreated: (id: string) => Promise<void>;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isRefund) return;
    void api.payments(appId).then((res) => {
      setPayments(res.payments);
      setForm((f) => ({ ...f, paymentId: f.paymentId ?? res.payments[0]?.id ?? "" }));
    });
  }, [isRefund, appId]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const input = isRefund
        ? {
            paymentId: form.paymentId ?? "",
            amountCents: Number(form.amount ?? ""),
            reason: form.reason ?? "",
          }
        : {
            vendorName: form.vendorName ?? "",
            currentMaskedRef: form.currentMaskedRef ?? "",
            newMaskedRef: form.newMaskedRef ?? "",
            country: (form.country ?? "").toUpperCase(),
            verificationChannel: form.verificationChannel ?? "callback_to_known_number",
            reason: form.reason ?? "",
          };
      const res = await api.createRecord(appId, input);
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
      {isRefund ? (
        <>
          <label>
            <span>Payment</span>
            <select value={form.paymentId ?? ""} onChange={(e) => set("paymentId", e.target.value)}>
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.reference} · {formatCents(p.amount_cents, p.currency)} · {formatCents(p.remaining_refundable_cents)}{" "}
                  refundable
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Amount in cents</span>
            <input value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value)} inputMode="numeric" />
          </label>
        </>
      ) : (
        <>
          <label>
            <span>Vendor</span>
            <input value={form.vendorName ?? ""} onChange={(e) => set("vendorName", e.target.value)} />
          </label>
          <label>
            <span>Current account (masked)</span>
            <input
              value={form.currentMaskedRef ?? ""}
              onChange={(e) => set("currentMaskedRef", e.target.value)}
              placeholder="****3312"
            />
          </label>
          <label>
            <span>New account (masked)</span>
            <input
              value={form.newMaskedRef ?? ""}
              onChange={(e) => set("newMaskedRef", e.target.value)}
              placeholder="****8890"
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
        </>
      )}
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
