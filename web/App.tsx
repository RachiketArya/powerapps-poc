import { useCallback, useEffect, useState } from "react";
import { ApiError, api, formatTime, type Actor, type CatalogApp, type DemoUser } from "./api";
import { AppSurface } from "./AppSurface";
import { Workshop } from "./Workshop";
import { Activity } from "./Activity";

type View = { kind: "catalog" } | { kind: "workshop" } | { kind: "activity" } | { kind: "app"; appId: string };

export default function App() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [actor, setActor] = useState<Actor | null>(null);
  const [catalog, setCatalog] = useState<CatalogApp[]>([]);
  const [view, setView] = useState<View>({ kind: "catalog" });
  const [error, setError] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => {
    try {
      const res = await api.catalog();
      setCatalog(res.apps);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setCatalog([]);
    }
  }, []);

  useEffect(() => {
    void api.demoUsers().then((res) => setUsers(res.users));
    void api
      .me()
      .then((res) => setActor(res.actor))
      .catch(() => setActor(null));
  }, []);

  useEffect(() => {
    if (actor) void refreshCatalog();
  }, [actor, refreshCatalog]);

  async function signIn(userId: string) {
    setError(null);
    if (!userId) {
      await api.logout();
      setActor(null);
      setCatalog([]);
      setView({ kind: "catalog" });
      return;
    }
    await api.login(userId);
    const me = await api.me();
    setActor(me.actor);
  }

  const current = view.kind === "app" ? catalog.find((a) => a.appId === view.appId) ?? null : null;

  return (
    <div className="shell">
      <div className="banner">
        Synthetic data · Simulated demo identity, not SSO · No payments, bank records or external systems are changed
      </div>

      <div className="frame">
        <nav className="sidenav">
          <div className="brand">Control Room</div>
          <p className="brand-sub">Governed internal apps on one trusted kernel</p>

          <span className="nav-label">Platform</span>
          <NavButton active={view.kind === "catalog"} onClick={() => setView({ kind: "catalog" })}>
            Catalog
          </NavButton>
          <NavButton active={view.kind === "workshop"} onClick={() => setView({ kind: "workshop" })}>
            Workshop
          </NavButton>
          <NavButton active={view.kind === "activity"} onClick={() => setView({ kind: "activity" })}>
            Activity
          </NavButton>

          <span className="nav-label">Apps</span>
          {catalog.map((a) => (
            <NavButton
              key={a.appId}
              active={view.kind === "app" && view.appId === a.appId}
              onClick={() => setView({ kind: "app", appId: a.appId })}
            >
              {a.definition?.title ?? a.appId}
              {a.status === "quarantined" && <span className="pill denied-pill">quarantined</span>}
            </NavButton>
          ))}
          {catalog.length === 0 && <span className="muted small pad">Select a demo identity to load the catalog.</span>}

          <div className="identity">
            <label>
              <span>Demo identity</span>
              <select value={actor?.id ?? ""} onChange={(e) => void signIn(e.target.value)}>
                <option value="">Signed out</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">
              Selecting an identity is not authentication. The server resolves the actor from the demo session cookie
              and ignores any actor or role sent in a request.
            </p>
          </div>
        </nav>

        <main>
          {error && <p className="notice denied">{error}</p>}
          {!actor && <SignedOut />}
          {actor && view.kind === "catalog" && (
            <Catalog apps={catalog} onOpen={(appId) => setView({ kind: "app", appId })} />
          )}
          {actor && view.kind === "workshop" && <Workshop actor={actor} onPromoted={() => void refreshCatalog()} />}
          {actor && view.kind === "activity" && <Activity actorId={actor.id} />}
          {actor && view.kind === "app" && current && current.status === "active" && (
            <AppSurface key={`${current.appId}-${current.version}`} app={current} actor={actor} />
          )}
          {actor && view.kind === "app" && current && current.status === "quarantined" && (
            <Quarantined app={current} />
          )}
        </main>
      </div>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={active ? "nav active" : "nav"} onClick={onClick}>
      {children}
    </button>
  );
}

function SignedOut() {
  return (
    <div className="surface">
      <header className="surface-head">
        <div>
          <h1>Select a demo identity</h1>
          <p className="muted">
            Every route requires a session. Roles are resolved server-side; there is no real authentication here.
          </p>
        </div>
      </header>
    </div>
  );
}

function Catalog({ apps, onOpen }: { apps: CatalogApp[]; onOpen: (appId: string) => void }) {
  return (
    <div className="surface">
      <header className="surface-head">
        <div>
          <h1>App catalog</h1>
          <p className="muted">
            Two apps are built and running on the shared kernel. Each is described by a validated definition that is
            re-checked every time the runtime loads it.
          </p>
        </div>
      </header>

      <table className="records catalog">
        <thead>
          <tr>
            <th>App</th>
            <th>Workflow</th>
            <th>Connector</th>
            <th>Owner</th>
            <th>Version</th>
            <th>Digest</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {apps.map((a) => (
            <tr key={a.appId}>
              <td>
                <strong>{a.definition?.title ?? a.appId}</strong>
                <div className="muted small">{a.definition?.summary}</div>
              </td>
              <td>{a.definition?.workflow ?? "—"}</td>
              <td>{a.definition?.connectorId ?? "—"}</td>
              <td>
                {a.definition?.owner.team} {a.definition?.owner.contactHandle}
              </td>
              <td>v{a.version}</td>
              <td>
                <code>{a.digest}</code>
              </td>
              <td className={a.status === "active" ? "success-text" : "denied-text"}>
                {a.status === "active" ? "Active locally" : "Quarantined"}
              </td>
              <td>
                <button type="button" className="secondary" onClick={() => onOpen(a.appId)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Ten further queues are plausible on this kernel but are not built. Two apps exist here; anything else is future
        work.
      </p>
    </div>
  );
}

function Quarantined({ app }: { app: CatalogApp }) {
  return (
    <div className="surface">
      <header className="surface-head">
        <div>
          <h1>{app.appId} is quarantined</h1>
          <p className="muted">
            The definition on disk no longer matches what was promoted, or no longer passes platform policy, so the
            runtime refuses to serve it. Promoted {formatTime(app.promotedAt)} by {app.promotedBy}.
          </p>
        </div>
      </header>
      <ol className="violations">
        {app.findings.map((f, i) => (
          <li key={`${f.code}-${i}`}>
            <div className="violation-head">
              <code>{f.path || "(document)"}</code>
              <span className="code">{f.code}</span>
            </div>
            <p>{f.message}</p>
            <p className="muted">Policy: {f.policy}</p>
            <p className="next">Next: {f.nextAction}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
