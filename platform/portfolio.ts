/**
 * The proposed internal-tools portfolio for the "build, phased and gated"
 * narrative: which tools exist, who would own them, and what risk they carry.
 *
 * `runnable` is the only claim that is load-bearing: it is true only for
 * entries backed by a real promoted definition in this repository. Everything
 * marked `planned` is illustrative roadmap — no code, health, test counts or
 * deployments are implied. Owner names are proposed roles, not real GitHub
 * teams or organizations.
 */
export interface PortfolioEntry {
  appId: string;
  title: string;
  /** Domain team that would own the app definition and its UAT. */
  businessOwner: string;
  /** Engineering team that would review the workflow adapter and connectors. */
  technicalOwner: string;
  riskTier: "low" | "medium" | "high";
  lifecycle: "demo" | "planned";
  /** True only when a definition is actually activated in this runtime. */
  runnable: true | false;
  /** Workflow the app rides on; null when the entry is only a proposal. */
  workflow: string | null;
  sharedPlatform: readonly string[];
  /** Where a runnable app's release evidence lives; null for planned work. */
  evidence: string | null;
}

const SHARED_PLATFORM = ["decision kernel", "manifest governance", "demo identity", "audit events"] as const;

export const PORTFOLIO: readonly PortfolioEntry[] = [
  {
    appId: "refund-review",
    title: "Refund review",
    businessOwner: "Finance Ops",
    technicalOwner: "Payments Engineering",
    riskTier: "high",
    lifecycle: "demo",
    runnable: true,
    workflow: "refund_review",
    sharedPlatform: SHARED_PLATFORM,
    evidence: "EVIDENCE.md · platform/registry/refund-review.test.ts",
  },
  {
    appId: "vendor-bank-change-review",
    title: "Vendor bank-change review",
    businessOwner: "Finance Ops",
    technicalOwner: "Treasury Engineering",
    riskTier: "high",
    lifecycle: "demo",
    runnable: true,
    workflow: "vendor_bank_change_review",
    sharedPlatform: SHARED_PLATFORM,
    evidence: "EVIDENCE.md · platform/registry/vendor-bank-change-review.test.ts",
  },
  {
    appId: "payment-reconciliation",
    title: "Payment reconciliation",
    businessOwner: "Finance Ops",
    technicalOwner: "Payments Engineering",
    riskTier: "medium",
    lifecycle: "planned",
    runnable: false,
    workflow: null,
    sharedPlatform: SHARED_PLATFORM,
    evidence: null,
  },
  {
    appId: "kyc-review",
    title: "KYC document review",
    businessOwner: "Compliance Ops",
    technicalOwner: "Identity Engineering",
    riskTier: "high",
    lifecycle: "planned",
    runnable: false,
    workflow: null,
    sharedPlatform: SHARED_PLATFORM,
    evidence: null,
  },
  {
    appId: "feature-flag-admin",
    title: "Feature flag administration",
    businessOwner: "Product Ops",
    technicalOwner: "Platform Engineering",
    riskTier: "medium",
    lifecycle: "planned",
    runnable: false,
    workflow: null,
    sharedPlatform: SHARED_PLATFORM,
    evidence: null,
  },
  {
    appId: "chargeback-triage",
    title: "Chargeback triage",
    businessOwner: "Disputes Ops",
    technicalOwner: "Payments Engineering",
    riskTier: "high",
    lifecycle: "planned",
    runnable: false,
    workflow: null,
    sharedPlatform: SHARED_PLATFORM,
    evidence: null,
  },
  {
    appId: "sanction-hit-review",
    title: "Sanction-hit review",
    businessOwner: "Compliance Ops",
    technicalOwner: "Identity Engineering",
    riskTier: "high",
    lifecycle: "planned",
    runnable: false,
    workflow: null,
    sharedPlatform: SHARED_PLATFORM,
    evidence: null,
  },
  {
    appId: "liquidity-monitor",
    title: "Liquidity monitor",
    businessOwner: "Treasury Ops",
    technicalOwner: "Treasury Engineering",
    riskTier: "medium",
    lifecycle: "planned",
    runnable: false,
    workflow: null,
    sharedPlatform: SHARED_PLATFORM,
    evidence: null,
  },
  {
    appId: "card-fraud-rules",
    title: "Card fraud rule review",
    businessOwner: "Risk Ops",
    technicalOwner: "Payments Engineering",
    riskTier: "high",
    lifecycle: "planned",
    runnable: false,
    workflow: null,
    sharedPlatform: SHARED_PLATFORM,
    evidence: null,
  },
  {
    appId: "escrow-release",
    title: "Escrow release approval",
    businessOwner: "Finance Ops",
    technicalOwner: "Payments Engineering",
    riskTier: "high",
    lifecycle: "planned",
    runnable: false,
    workflow: null,
    sharedPlatform: SHARED_PLATFORM,
    evidence: null,
  },
  {
    appId: "pricing-exception",
    title: "Pricing exception desk",
    businessOwner: "Commercial Ops",
    technicalOwner: "Billing Engineering",
    riskTier: "medium",
    lifecycle: "planned",
    runnable: false,
    workflow: null,
    sharedPlatform: SHARED_PLATFORM,
    evidence: null,
  },
  {
    appId: "vendor-onboarding",
    title: "Vendor onboarding",
    businessOwner: "Procurement Ops",
    technicalOwner: "Treasury Engineering",
    riskTier: "medium",
    lifecycle: "planned",
    runnable: false,
    workflow: null,
    sharedPlatform: SHARED_PLATFORM,
    evidence: null,
  },
  {
    appId: "access-review",
    title: "Quarterly access review",
    businessOwner: "Security Ops",
    technicalOwner: "Identity Engineering",
    riskTier: "medium",
    lifecycle: "planned",
    runnable: false,
    workflow: null,
    sharedPlatform: SHARED_PLATFORM,
    evidence: null,
  },
];
