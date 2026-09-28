import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  formatTime,
  type AssuranceRun,
  type DecisionEvent,
  type PlatformEvent,
  type RevisionBinding,
} from "./api";

/**
 * `actorId` is a dependency, not decoration: oversight data belongs to the
 * identity that read it, so switching demo identity must clear and refetch it
 * rather than leave an administrator's events on a maker's screen.
 */
export function Activity({ actorId }: { actorId: string }) {
  const [platform, setPlatform] = useState<PlatformEvent[]>([]);
  const [decisions, setDecisions] = useState<DecisionEvent[]>([]);
  const [oversightError, setOversightError] = useState<string | null>(null);
  const [assurance, setAssurance] = useState<{
    run: AssuranceRun | null;
    error: string | null;
    revision: RevisionBinding;
    command: string;
    invariants: Array<{ workflow: string; control: string }>;
    productionGaps: string[];
  } | null>(null);

  useEffect(() => {
    let current = true;
    setPlatform([]);
    setDecisions([]);
    setOversightError(null);
    setAssurance(null);
    void api
      .activity()
      .then((res) => {
        if (!current) return;
        setPlatform(res.platform);
        setDecisions(res.decisions);
        setOversightError(null);
      })
      .catch((err: unknown) => {
        if (!current) return;
        setOversightError(err instanceof ApiError ? err.message : "Activity could not be loaded.");
      });
    void api.assurance().then(
      (res) => {
        if (current) setAssurance(res);
      },
      () => {
        if (current) setAssurance(null);
      },
    );
    return () => {
      current = false;
    };
  }, [actorId]);

  return (
    <div className="surface">
      <header className="surface-head">
        <div>
          <h1>Activity and assurance</h1>
          <p className="muted">
            Everything below is read from this runtime: promotion attempts, decisions, and the last recorded test run.
          </p>
        </div>
      </header>

      <div className="activity">
        {oversightError && <p className="notice denied">{oversightError}</p>}

        <section>
          <h2>Platform events</h2>
          <table className="records">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>App</th>
                <th>Actor</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {platform.map((e) => (
                <tr key={e.id}>
                  <td>{formatTime(e.created_at)}</td>
                  <td>{e.event_type}</td>
                  <td>
                    {e.app_id ?? "—"}
                    {e.app_version ? ` v${e.app_version}` : ""}
                  </td>
                  <td>
                    {e.actor_id} ({e.actor_role})
                  </td>
                  <td className={e.outcome === "denied" ? "denied-text" : "success-text"}>{e.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Decision events</h2>
          <table className="records">
            <thead>
              <tr>
                <th>When</th>
                <th>Record</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((e) => (
                <tr key={e.id}>
                  <td>{formatTime(e.created_at)}</td>
                  <td>{e.entity_id}</td>
                  <td>{e.action}</td>
                  <td>
                    {e.actor_name ?? e.actor_id} ({e.actor_role})
                  </td>
                  <td>{e.to_status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Last recorded assurance run</h2>
          {assurance?.error && <p className="notice muted-notice">{assurance.error}</p>}
          {assurance?.run && (
            <>
              <p className={assurance.run.failed > 0 ? "notice denied" : "notice success"}>
                {assurance.run.passed}/{assurance.run.total} passed, {assurance.run.failed} failed · started{" "}
                {assurance.run.startedAt ? formatTime(assurance.run.startedAt) : "unknown"} · recorded{" "}
                {formatTime(assurance.run.recordedAt)}
              </p>
              <p className={assurance.revision.stale ? "notice denied" : "notice muted-notice"}>
                Recorded against{" "}
                <code>{assurance.revision.recordedFor?.slice(0, 12) ?? "an unrecorded revision"}</code>
                {assurance.revision.uncommittedChangesWhenRecorded
                  ? " with uncommitted changes in the tree"
                  : ""}
                . This checkout is at <code>{assurance.revision.current?.slice(0, 12) ?? "unknown"}</code>.{" "}
                {assurance.revision.stale
                  ? "The source has moved since the run, so these results may not describe the code running now."
                  : assurance.revision.stale === false
                    ? "Same revision, so the results describe this code."
                    : "Revision could not be determined."}
              </p>
              {assurance.run.files.map((f) => (
                <details key={f.file}>
                  <summary>
                    {f.file} — {f.tests.length} tests, {f.status}
                  </summary>
                  <ul className="tests">
                    {f.tests.map((t) => (
                      <li key={t.title} className={t.status === "passed" ? "success-text" : "denied-text"}>
                        {t.status === "passed" ? "passed" : t.status} · {t.title}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </>
          )}
          <p className="muted small">
            This view shows whatever <code>{assurance?.command ?? "npm run assure"}</code> last wrote to
            evidence/test-results.json. It is not a hard-coded status, a failing run is displayed as failing, and the
            revision binding is a staleness signal rather than proof that the run happened.
          </p>
        </section>

        <section>
          <h2>Platform invariants</h2>
          <ul className="plain">
            {assurance?.invariants.map((i) => (
              <li key={`${i.workflow}-${i.control}`}>
                <code>{i.workflow}</code> {i.control}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Production gaps</h2>
          <ul className="plain">
            {assurance?.productionGaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
