# System design — local prototype vs target design

## What runs locally today

```mermaid
flowchart LR
    subgraph untrusted["Untrusted — apps/"]
        M1[refund-review.app.json]
        M2[vendor-bank-change-review.app.json]
        MM[maker-edited manifests]
    end
    subgraph trusted["Trusted — platform/"]
        V[Manifest validator]
        R[Workflow registry<br/>roles · ceilings · fields · controls]
        K[Decision kernel<br/>scope · SoD · reasons · versions<br/>idempotency · atomic audit]
        DB[(SQLite<br/>records · events · releases)]
        PR[Promotion<br/>digest files + atomic pointer]
    end
    subgraph web["web/"]
        RA[RefundReviewApp]
        VA[VendorBankChangeApp]
        RS[ReviewSurface<br/>shared shell]
        WS[Workshop · Activity · Catalog]
    end
    M1 & M2 & MM --> V --> R
    RS --> K
    RA & VA --> RS
    K --> DB
    V --> PR --> DB
```

Every request resolves the actor server-side (demo session cookie), then each
path enforces capability **and** resource scope. A record outside the actor's
scope answers 404 exactly like a missing one.

## Target design — phase-gated paved road

```mermaid
flowchart TB
    subgraph domain["Domain teams"]
        FO[Finance Ops<br/>business owner]
        CO[Compliance Ops<br/>business owner]
    end
    subgraph eng["Technical owners"]
        PE[Payments Engineering]
        TE[Treasury Engineering]
    end
    subgraph devin["Devin"]
        D1[Writes manifest + app module<br/>inside the paved road]
    end
    subgraph plat["Platform engineering"]
        CI[Protected CI / deploy identity]
        BP[Branch protection + CODEOWNERS<br/>platform/ vs apps/]
        ENV[dev / test / prod environments]
        EGR[Network egress policy]
    end
    FO & CO -->|app request: owner · workflow · data · actions · risk · UAT| D1
    D1 -->|manifest + module PR| PE & TE
    PE & TE -->|domain review| CI
    CI -->|promote| ENV
    BP --> CI
    EGR --> ENV
```

Domain teams own apps; platform engineering owns the foundation apps ride
on. In the target production workflow, Devin produces app definitions and
workflow-specific UI without production credentials; protected review and
deployment permissions govern changes to shared controls. These repository
protections are not configured in the prototype. Runtime manifest validation
and server-side scope checks are implemented; unrestricted repository write
access could still alter that implementation.

## Boundary honesty

- Resource scope is per-user, per-record and enforced in the kernel and the
  domain adapters; UI filters are presentation only.
- Scope is a coarse team boundary (`us-ops`, `emea-ops`, `*` oversight) —
  it is **not** row-level multi-tenancy and `*` is an oversight carve-out
  that would map to a supervised audit role in production.
- Capability narrowing remains a per-app surface control, not user data
  isolation; scope is the per-user complement.
- Demo identity is not SSO; `*` maps to "platform oversight", not a real
  break-glass design.
