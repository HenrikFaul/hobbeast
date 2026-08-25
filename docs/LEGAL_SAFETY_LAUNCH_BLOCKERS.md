# Legal and safety launch blockers

**Status:** NO-GO until every P0/P1 row has named owner approval and verifiable evidence.
**Scope:** product/operations decision checklist; this document is not legal advice and does not invent approved policy text.

| ID | Decision/evidence required | Severity | Required owner | Current evidence | Status |
|---|---|---:|---|---|---|
| LS-01 | Minimum-age policy and signup enforcement | P0 | Legal + Product | No approved age policy or enforcement evidence in repository | HOLD |
| LS-02 | Minors policy, guardian/incident escalation and prohibited contact rules | P0 | Legal + Trust & Safety | No approved minors process | HOLD |
| LS-03 | Approved Terms of Service / community rules with version and effective date | P0 | Legal | Expericentre-branded v0.1 legal-center draft and working footer routes exist; legal approval and effective version do not | HOLD |
| LS-04 | Approved privacy notice: purposes, legal bases, retention, processors and DSR contact | P0 | Legal + DPO/privacy owner | Engineering inventory and linked v0.1 public-facing draft exist; controller identity, final retention/processors and approval do not | HOLD |
| LS-05 | Emergency/credible-imminent-danger process and local escalation boundaries | P0 | Trust & Safety + Legal | UI correctly says Hobbeast is not an emergency service; staffed process is unverified | HOLD |
| LS-06 | Moderation coverage hours, severity SLA, duty rota and escalation contact | P0 | Trust & Safety Ops | Queue exists in source; no staffed coverage evidence | HOLD |
| LS-07 | Appeals policy, response targets and independent reviewer rules | P1 | Trust & Safety + Legal | Appeal data path exists; policy/coverage unapproved | HOLD |
| LS-08 | Final report/audit/analytics retention periods and legal hold exceptions | P1 | Privacy + Legal | Engineering defaults are 730/2555/395 days and must be approved or changed before migration | HOLD |
| LS-09 | Report evidence attachment storage classification, malware scan and access policy | P1 | Security + Trust & Safety | Attachments intentionally unsupported | HOLD |
| LS-10 | External processor inventory, DPA/ToS/licence and transfer review | P0 | Legal + Security | Technical data-flow inventory and draft disclosure exist; contractual evidence and final list are missing | HOLD |
| LS-11 | Support contact and safety report acknowledgement copy | P1 | Support + Trust & Safety | `hello@henrislabs.hu` is now linked for general contact; staffed safety ownership and SLA remain unverified | HOLD |
| LS-12 | Law-enforcement/data-preservation request procedure | P1 | Legal + Security | No approved procedure | HOLD |
| LS-13 | Private-home/night/physical-contact event review rubric | P1 | Trust & Safety + Community Ops | Risk flags trigger human review; rubric and staff are missing | HOLD |
| LS-14 | Promoted-content quality policy, refunds/cancellation, tax/invoice and payout contracts | P0 before monetization | Legal + Finance + Product | Payment is deliberately inactive | HOLD |

## Release rule

- A feature flag cannot override these blockers.
- Automated report volume or a risk flag may create/raise a review item; it cannot produce an automatic permanent ban.
- No UI copy may promise an immediate human response unless coverage is operationally proven.
- Payment-provider credentials, webhooks, money movement and promoted placement remain prohibited until LS-14 is approved.

## Engineering legal-center evidence (v1.13.0)

- `/legal` is an Expericentre-branded, keyboard-navigable draft hub for imprint,
  privacy, cookies, terms and community principles; Footer and onboarding link to it.
- The draft explicitly identifies itself as not legally approved and does not invent
  a legal entity name, registered office, registration number, tax number, DPO,
  processor contract or effective retention decision.
- Verified contact supplied by the product owner: `hello@henrislabs.hu`.
- This improves discoverability and reviewability; it does **not** satisfy LS-01,
  LS-03, LS-04, LS-08, LS-10 or LS-11 without named-owner evidence.
