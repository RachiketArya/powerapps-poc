import { useEffect, useState } from "react";
import { ApiError, api, formatTime, type Actor, type Violation } from "./api";

/**
 * The workshop is where an app maker pastes a definition (typically written by
 * a coding agent from a plain description) and finds out whether the platform
 * will let it run. Validation is advisory; promotion is the controlled step.
 */
export function Workshop({ actor, onPromoted }: { actor: Actor; onPromoted: () => void }) {
  const [templates, setTemplates] = useState<Array<{ file: string; body: unknown }>>([]);
  const [unsafeExamples, setUnsafeExamples] = useState<Array<{ file: string; body: unknown }>>([]);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ ok: boolean; digest: string | null; violations: Violation[]; checkedAt: string } | null>(
    null,
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ tone: "success" | "denied"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.templates().then((res) => {
      setTemplates(res.templates);
      setUnsafeExamples(res.unsafeExamples);
      if (res.templates[0]) setText(JSON.stringify(res.templates[0].body, null, 2));
    });
  }, []);

  function load(body: unknown) {
    setText(JSON.stringify(body, null, 2));
    setResult(null);
    setParseError(null);
    setPromotion(null);
  }

  function parsed(): unknown | undefined {
    try {
      const value: unknown = JSON.parse(text);
      setParseError(null);
      return value;
    } catch (err) {
      setParseError(`This is not valid JSON: ${(err as Error).message}`);
      setResult(null);
      return undefined;
    }
  }

  async function validate() {
    const definition = parsed();
    if (definition === undefined) return;
    setBusy(true);
    setPromotion(null);
    try {
      setResult(await api.validate(definition));
    } finally {
      setBusy(false);
    }
  }

  async function promote() {
    const definition = parsed();
    if (definition === undefined) return;
    setBusy(true);
    try {
      const res = await api.promote(definition);
      setPromotion({
        tone: "success",
        message: `${res.app.appId} v${res.app.version} activated locally · digest ${res.app.digest}. ${res.note}`,
      });
      setResult({ ok: true, digest: res.app.digest, violations: [], checkedAt: new Date().toISOString() });
      onPromoted();
    } catch (err) {
      if (err instanceof ApiError) {
        setPromotion({ tone: "denied", message: err.message });
        if (err.violations.length) {
          setResult({ ok: false, digest: null, violations: err.violations, checkedAt: new Date().toISOString() });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const canPromote = actor.role === "platform_admin";

  return (
    <div className="surface">
      <header className="surface-head">
        <div>
          <h1>App workshop</h1>
          <p className="muted">
            Describe the app you need to a coding agent, paste the definition it produces, and the platform validator
            decides whether it may run. Definitions are data: they select labels, fields, a registered workflow, an
            approved connector and a subset of that workflow's capabilities. Nothing else.
          </p>
        </div>
      </header>

      <div className="workshop">
        <section>
          <div className="template-row">
            <span className="muted small">Start from</span>
            {templates.map((t) => (
              <button key={t.file} type="button" className="chip" onClick={() => load(t.body)}>
                {t.file}
              </button>
            ))}
          </div>
          <div className="template-row">
            <span className="muted small">Try a refused definition</span>
            {unsafeExamples.map((t) => (
              <button key={t.file} type="button" className="chip danger" onClick={() => load(t.body)}>
                {t.file.replace(/^unsafe-|\.json$/g, "")}
              </button>
            ))}
          </div>

          <label className="editor">
            <span>App definition (JSON)</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={26} />
          </label>

          <div className="actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => void validate()}>
              Validate
            </button>
            <button type="button" disabled={busy || !canPromote} onClick={() => void promote()}>
              Activate locally
            </button>
            {!canPromote && (
              <span className="muted small">
                Your demo role ({actor.role}) may draft and validate. A platform admin activates. The server enforces
                this regardless of what the page allows.
              </span>
            )}
          </div>
        </section>

        <section className="findings">
          <h2>Release check</h2>
          {parseError && <p className="notice denied">{parseError}</p>}
          {promotion && <p className={`notice ${promotion.tone}`}>{promotion.message}</p>}
          {!result && !parseError && <p className="muted">Validate the definition to see what the platform allows.</p>}
          {result && result.ok && (
            <p className="notice success">
              Accepted at {formatTime(result.checkedAt)} · digest <code>{result.digest}</code>. The digest identifies
              this exact content; it is not proof of authorship.
            </p>
          )}
          {result && !result.ok && (
            <>
              <p className="notice denied">
                Refused at {formatTime(result.checkedAt)} · {result.violations.length} policy violation
                {result.violations.length === 1 ? "" : "s"}. Nothing was written.
              </p>
              <ol className="violations">
                {result.violations.map((v, i) => (
                  <li key={`${v.code}-${v.path}-${i}`}>
                    <div className="violation-head">
                      <code>{v.path || "(document)"}</code>
                      <span className="code">{v.code}</span>
                    </div>
                    <p>{v.message}</p>
                    <p className="muted">Policy: {v.policy}</p>
                    <p className="next">Next: {v.nextAction}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
