import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  ApiError,
  api,
  fieldLabel,
  fieldValue,
  formatTime,
  STATUS_LABEL,
  type Actor,
  type CatalogApp,
  type RecordDetail,
  type RecordSummary,
} from "../api";

/**
 * One review surface used by both shipped apps. The definition chooses the
 * labels, the columns and which capabilities are offered; every rule applied
 * to a decision lives on the server.
 */
export function ReviewSurface({
  app,
  actor,
  renderCreateForm,
  renderInspection,
}: {
  app: CatalogApp;
  actor: Actor;
  renderCreateForm: (appId: string, onCreated: (id: string) => Promise<void>) => React.ReactNode;
  renderInspection?: (record: RecordDetail) => React.ReactNode;
}) {
  const definition = app.definition!;
  const [status, setStatus] = useState("pending");
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const canCreate = definition.capabilities.includes("record.create");

  // Creating a record changes the filter and reloads the queue at the same
  // time; only the newest request may write to the table, or the reply to the
  // old filter can land last and leave rows that do not match it.
  const listRequest = useRef(0);

  const loadList = useCallback(async () => {
    const seq = ++listRequest.current;
    try {
      const res = await api.records(definition.appId, { status, q: query });
      if (seq !== listRequest.current) return;
      setRecords(res.records);
      setListError(null);
    } catch (err) {
      if (seq !== listRequest.current) return;
      setListError(err instanceof ApiError ? err.message : "Could not load the queue");
      setRecords([]);
    }
  }, [definition.appId, status, query]);

  // Bumped when a record is created or decided. Reloading through this
  // instead of calling `loadList` from the handler keeps the request on the
  // filter that is current after the handler's state updates, and still
  // reloads when the filter did not change.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    void loadList();
  }, [loadList, reloadToken]);

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
    setReloadToken((n) => n + 1);
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

          {creating &&
            canCreate &&
            renderCreateForm(definition.appId, async (id) => {
              setCreating(false);
              setQuery("");
              setStatus("pending");
              await afterChange(id);
            })}

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
              inspection={renderInspection?.(detail)}
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
  inspection,
  onDecided,
  onRefresh,
}: {
  app: CatalogApp;
  actor: Actor;
  record: RecordDetail;
  inspection?: React.ReactNode;
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

      {inspection}

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
