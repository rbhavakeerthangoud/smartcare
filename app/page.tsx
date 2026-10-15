"use client";

import Link from "next/link";
import { useState } from "react";
import { useSmartCareAuth } from "@/lib/supabase/auth-context";

const platformFeatures = [
  {
    number: "01",
    label: "STRUCTURE",
    title: "Care plans with clear purpose.",
    description:
      "Organize clinician instructions, scheduled activities, and recurrence protocols in one structured workspace.",
    icon: "✳",
  },
  {
    number: "02",
    label: "DAILY ROUTINES",
    title: "Time-aware execution windows.",
    description:
      "Define allowed start and end times across time zones to keep recovery activities on track without confusion.",
    icon: "◷",
  },
  {
    number: "03",
    label: "MULTI-SOURCE VERIFICATION",
    title: "Verified recovery evidence.",
    description:
      "Capture patient self-reports, caregiver confirmations, diagnostic documents, and IoT device events transparently.",
    icon: "↗",
  },
  {
    number: "04",
    label: "CLINICAL OVERSIGHT",
    title: "Deterministic escalations.",
    description:
      "Automatically route review alerts to clinical teams when activities are missed, late, or conflicting with prerequisite tasks.",
    icon: "⚕",
  },
];

const steps = [
  {
    number: "01",
    title: "Authorize & Credential",
    description:
      "Hospital administrators credential and authorize licensed doctors to establish post-discharge care protocols on SmartCare.",
  },
  {
    number: "02",
    title: "Prescribe & Grant Access",
    description:
      "Authorized doctors create personalized care plans with time-windowed activities and grant their assigned patients direct access.",
  },
  {
    number: "03",
    title: "Execute & Record Evidence",
    description:
      "Patients complete daily routines with integrated family caregiving coordination, submitting patient reports, photo documents, or device data.",
  },
  {
    number: "04",
    title: "Proactive Follow-Up",
    description:
      "The system detects execution deviations, missed windows, or conflicts and immediately alerts the clinical oversight team.",
  },
];

const portalCards = [
  {
    icon: "✳",
    number: "01",
    roleTag: "HOSPITAL ADMIN",
    title: "Hospital Admin Portal",
    description:
      "Authorize licensed medical staff, manage doctor directories, oversee facility-wide compliance, audit administrative activity, and govern patient access permissions.",
    href: "/admin",
    action: "Enter admin portal",
  },
  {
    icon: "⚕",
    number: "02",
    roleTag: "DOCTOR / CLINICAL",
    title: "Doctor & Clinical Portal",
    description:
      "Prescribe evidence-based recovery plans, monitor patient cohort execution, coordinate caregiving support, inspect dependencies, and resolve clinical safety alerts.",
    href: "/clinical",
    action: "Enter doctor portal",
  },
  {
    icon: "♡",
    number: "03",
    roleTag: "PATIENT",
    title: "Patient Recovery Portal",
    description:
      "Follow your personalized daily recovery schedule, log prescribed medications and vitals, submit verified evidence, and stay connected with your care team.",
    href: "/patient",
    action: "Enter patient portal",
  },
];

const principles = [
  {
    number: "01",
    title: "Clarity first",
    description:
      "Information is structured around the patient's recovery timeline with explicit execution windows and clear guidance.",
  },
  {
    number: "02",
    title: "Access with purpose",
    description:
      "Database-level Row-Level Security ensures patients, family caregivers, and physicians only access authorized medical records.",
  },
  {
    number: "03",
    title: "Clinical safety & governance",
    description:
      "SmartCare coordinates care without altering medical prescriptions; every change is immutably logged for clinical audit.",
  },
];

const faqs = [
  {
    question: "What is SmartCare?",
    answer:
      "SmartCare is a secure post-discharge care coordination platform that organizes clinician-prescribed care plans, scheduled recovery activities, verification evidence, and clinical escalation workflows.",
  },
  {
    question: "Who can use SmartCare?",
    answer:
      "SmartCare provides dedicated workspaces for four roles: Patients, Family Caregivers, Doctors/Clinicians, and Hospital Administrators, each with role-specific access permissions.",
  },
  {
    question: "How does task verification work?",
    answer:
      "Depending on the clinician's configuration, activities are verified through patient self-reporting, caregiver secondary confirmation, diagnostic document uploads, or connected IoT health device events.",
  },
  {
    question: "What happens if a scheduled activity is missed?",
    answer:
      "If an activity deadline passes without valid completion evidence, the system deterministically flags the task and can route an automated escalation alert to the clinical oversight team.",
  },
  {
    question: "Does SmartCare replace medical advice?",
    answer:
      "No. SmartCare is a care-plan coordination platform. Medical diagnosis, treatment decisions, and prescriptions remain strictly the responsibility of qualified healthcare professionals.",
  },
  {
    question: "How is patient data protected?",
    answer:
      "Patient data is protected using database-level Row-Level Security (RLS) in Supabase PostgreSQL, ensuring encrypted storage, strict permission boundaries, and immutable audit logging.",
  },
];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={`sc-home-arrow ${diagonal ? "is-diagonal" : ""}`}
    >
      <path
        d={
          diagonal
            ? "M7 17 17 7M8 7h9v9"
            : "M4 12h15m-6-6 6 6-6 6"
        }
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Brand() {
  return (
    <Link href="/" className="sc-home-brand" aria-label="SmartCare home">
      <span className="sc-home-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none">
          <path
            d="M20 7v26M7 20h26"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="20" cy="20" r="7" fill="currentColor" />
          <circle cx="20" cy="20" r="2.5" fill="#0f050d" />
        </svg>
      </span>
      <span className="sc-home-brand-name">
        Smart<span>Care</span>
      </span>
    </Link>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="sc-home-eyebrow">
      <span className="sc-home-eyebrow-dot" />
      {children}
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="sc-home-preview-wrap">
      <div className="sc-home-preview-orbit sc-home-float" />

      <div className="sc-home-preview">
        <div className="sc-home-preview-topbar">
          <div className="sc-home-window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <span>SMARTCARE / WORKSPACE</span>
          <span className="sc-home-preview-live">
            <i /> LIVE SYSTEM PREVIEW
          </span>
        </div>

        <div className="sc-home-preview-body">
          <div className="sc-home-preview-greeting">
            <div>
              <p className="sc-home-micro-label">PATIENT RECOVERY WORKSPACE</p>
              <h2>Clear care plans, verifiable progress.</h2>
              <p>Prescribed regimens, execution windows, and clinical oversight.</p>
            </div>
            <div className="sc-home-preview-symbol" aria-hidden="true">
              ✳
            </div>
          </div>

          <div className="sc-home-preview-stats">
            <div className="sc-home-mini-card">
              <span className="sc-home-mini-icon">◎</span>
              <span className="sc-home-mini-label">Adherence Tracking</span>
              <strong>83% Complete</strong>
              <span className="sc-home-mini-foot">
                5 of 6 activities done today
              </span>
            </div>

            <div className="sc-home-mini-card">
              <span className="sc-home-mini-icon purple">◷</span>
              <span className="sc-home-mini-label">Daily Execution</span>
              <strong>Time-Aware</strong>
              <span className="sc-home-mini-foot">
                Enforced start &amp; end windows
              </span>
            </div>
          </div>

          <div className="sc-home-preview-list">
            <div className="sc-home-preview-list-head">
              <div>
                <p className="sc-home-preview-list-title">Today&apos;s recovery activities</p>
                <p className="sc-home-preview-list-sub">
                  Sample Protocol Schedule
                </p>
              </div>
              <span className="sc-home-outline-pill">Illustrative</span>
            </div>

            {[
              {
                number: "01",
                title: "Wound Dressing & Inspection",
                window: "08:00 – 10:00",
                badge: "Completed on time",
                badgeClass: "text-emerald-300",
              },
              {
                number: "02",
                title: "Morning Prescribed Medication",
                window: "09:00 – 10:30",
                badge: "Caregiver Verified",
                badgeClass: "text-[#EA9D9D]",
              },
              {
                number: "03",
                title: "Post-Op Physical Therapy Check",
                window: "14:00 – 16:00",
                badge: "Scheduled Today",
                badgeClass: "text-slate-400",
              },
            ].map((item, index) => (
              <div className="sc-home-task-row" key={item.number}>
                <span className={`sc-home-task-number n${index + 1}`}>
                  {item.number}
                </span>
                <div className="min-w-0 flex-1">
                  <strong>{item.title}</strong>
                  <p>{item.window}</p>
                </div>
                <span className={`text-[0.7rem] font-medium ${item.badgeClass} shrink-0`}>
                  {item.badge}
                </span>
                <span className="sc-home-task-chevron">
                  <Arrow diagonal />
                </span>
              </div>
            ))}
          </div>

          <div className="sc-home-preview-note">
            <span>✦</span>
            <p>
              <strong>Connected by design</strong>
              <small>Multi-source evidence verification with automated clinical escalations.</small>
            </p>
          </div>

          <p className="sc-home-preview-disclaimer">
            Illustrative interface preview — not live patient information
          </p>
        </div>
      </div>

      <div className="sc-home-float-card sc-home-float-card-one">
        <span className="sc-home-float-card-icon">↗</span>
        <span>
          <strong>Progress visibility</strong>
          <small>Real-time adherence tracking</small>
        </span>
      </div>

      <div className="sc-home-float-card sc-home-float-card-two">
        <span className="sc-home-float-card-icon violet">⌘</span>
        <span>
          <strong>Role-aware access</strong>
          <small>PostgreSQL Row-Level Security</small>
        </span>
      </div>
    </div>
  );
}

function PortalCard({
  icon,
  number,
  roleTag,
  title,
  description,
  href,
  action,
}: (typeof portalCards)[number]) {
  return (
    <article className="sc-home-feature-card">
      <div className="sc-home-feature-top">
        <span className="sc-home-feature-icon">{icon}</span>
        <span className="sc-home-feature-number">{number}</span>
      </div>
      <p className="sc-home-feature-label">{roleTag} WORKSPACE</p>
      <h3>{title}</h3>
      <p className="sc-home-feature-description">{description}</p>
      <Link
        href={href}
        className="sc-home-text-link mt-auto"
      >
        {action} <Arrow diagonal />
      </Link>
      <span className="sc-home-feature-line" />
    </article>
  );
}

export default function HomePage() {
  const { session, role } = useSmartCareAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userDashboard =
    role === "PATIENT"
      ? "/patient"
      : role === "CLINICIAN"
      ? "/clinical"
      : role === "CAREGIVER"
      ? "/caregiver"
      : role === "ADMIN"
      ? "/admin"
      : null;

  return (
    <main className="sc-home">
      <div className="sc-home-ambient" aria-hidden="true">
        <span className="sc-home-ambient-one" />
        <span className="sc-home-ambient-two" />
        <span className="sc-home-grid" />
      </div>

      <div className="sc-home-content">
        {/* Section 1: Header with SmartCare branding and navigation */}
        <header className="sc-home-header">
          <nav className="sc-home-nav" aria-label="Main navigation">
            <Brand />

            <div className="sc-home-nav-links">
              <a href="#platform">Platform</a>
              <a href="#workflow">How it works</a>
              <a href="#portals">Workspaces</a>
              <a href="#principles">Safety &amp; Governance</a>
              <a href="#faqs">FAQ</a>
            </div>

            <div className="sc-home-nav-actions">
              {session && userDashboard ? (
                <Link className="sc-home-nav-cta" href={userDashboard}>
                  Open {role?.toLowerCase()} portal <Arrow diagonal />
                </Link>
              ) : (
                <Link className="sc-home-nav-cta" href="/patient">
                  Explore Workspaces <Arrow diagonal />
                </Link>
              )}

              {/* Mobile hamburger menu toggle */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="sc-home-mobile-toggle"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  {mobileMenuOpen ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  )}
                </svg>
              </button>
            </div>
          </nav>

          {/* Responsive Mobile Drawer */}
          {mobileMenuOpen && (
            <div className="sc-home-mobile-drawer">
              <a href="#platform" onClick={() => setMobileMenuOpen(false)}>
                Platform
              </a>
              <a href="#workflow" onClick={() => setMobileMenuOpen(false)}>
                How it works
              </a>
              <a href="#portals" onClick={() => setMobileMenuOpen(false)}>
                Workspaces
              </a>
              <a href="#principles" onClick={() => setMobileMenuOpen(false)}>
                Safety &amp; Governance
              </a>
              <a href="#faqs" onClick={() => setMobileMenuOpen(false)}>
                FAQ
              </a>
              <div className="pt-2">
                <Link
                  href={userDashboard || "/patient"}
                  onClick={() => setMobileMenuOpen(false)}
                  className="sc-home-button-primary w-full text-center"
                >
                  {session && userDashboard
                    ? `Open ${role?.toLowerCase()} portal →`
                    : "Explore Patient Portal →"}
                </Link>
              </div>
            </div>
          )}
        </header>

        {/* Section 2: Hero section with healthcare headline, supporting copy, dual CTAs */}
        <section className="sc-home-hero">
          <div className="sc-home-hero-copy sc-home-reveal">
            <Eyebrow>INTELLIGENT HEALTHCARE RECOVERY PLATFORM</Eyebrow>

            <h1>
              Better care.
              <br />
              Beyond the
              <br />
              <span className="sc-home-gradient-text">hospital door.</span>
            </h1>

            <p className="sc-home-hero-description">
              SmartCare brings care plans, daily activities, progress records,
              and follow-up workflows into one connected workspace for the
              recovery journey.
            </p>

            <div className="sc-home-hero-actions">
              <Link className="sc-home-button-primary" href="/patient">
                Enter Patient Portal <Arrow />
              </Link>
              <a className="sc-home-button-quiet" href="#portals">
                Explore Workspaces <span>↓</span>
              </a>
            </div>

            <div className="sc-home-hero-foot">
              <span className="sc-home-foot-icon">✳</span>
              <p>
                Structured around the three pillars of coordinated recovery.
                <small>Hospital Admins · Doctors &amp; Clinicians · Patients</small>
              </p>
            </div>
          </div>

          {/* Section 3: Product / dashboard preview demonstrating the platform */}
          <div className="sc-home-hero-visual sc-home-reveal sc-home-reveal-delay">
            <DashboardPreview />
          </div>

          <div className="sc-home-hero-index" aria-hidden="true">
            <span>01</span>
            <i />
            <span>04</span>
          </div>
        </section>

        {/* Manifesto divider banner */}
        <section className="sc-home-manifesto" aria-label="Our mission">
          <p className="sc-home-manifesto-label">THE SMARTCARE APPROACH</p>
          <p className="sc-home-manifesto-text">
            Less confusion. <span>More clarity.</span>
            <br />
            A more connected recovery journey.
          </p>
          <span className="sc-home-manifesto-orb" aria-hidden="true">
            ✳
          </span>
        </section>

        {/* Section 4: Platform features section with consistent 4-card grid */}
        <section id="platform" className="sc-home-section sc-home-platform">
          <div className="sc-home-section-heading">
            <div>
              <Eyebrow>BUILT AROUND THE RECOVERY JOURNEY</Eyebrow>
              <h2>
                A complete healthcare
                <br />
                <span>coordination ecosystem.</span>
              </h2>
            </div>
            <p>
              Thoughtful capabilities designed to structure care plans, eliminate patient confusion,
              and coordinate timely follow-up across clinical teams.
            </p>
          </div>

          <div className="sc-home-feature-grid">
            {platformFeatures.map((feature) => (
              <article className="sc-home-feature-card" key={feature.number}>
                <div className="sc-home-feature-top">
                  <span className="sc-home-feature-icon">{feature.icon}</span>
                  <span className="sc-home-feature-number">{feature.number}</span>
                </div>
                <p className="sc-home-feature-label">{feature.label}</p>
                <h3>{feature.title}</h3>
                <p className="sc-home-feature-description">
                  {feature.description}
                </p>
                <span className="sc-home-feature-line" />
              </article>
            ))}
          </div>
        </section>

        {/* Section 5: Four-step care workflow section */}
        <section id="workflow" className="sc-home-workflow">
          <div className="sc-home-workflow-inner">
            <div className="sc-home-workflow-intro">
              <Eyebrow>A CLEARER WAY FORWARD</Eyebrow>
              <h2>
                From the care plan
                <br />
                <span>to every next step.</span>
              </h2>
              <p>
                Post-discharge recovery involves many interconnected activities. SmartCare organizes
                the journey into a predictable, four-step clinical workflow.
              </p>
              <Link href="/login" className="sc-home-text-link">
                Open your workspace <Arrow diagonal />
              </Link>
            </div>

            <div className="sc-home-steps">
              {steps.map((step, index) => (
                <article className="sc-home-step" key={step.number}>
                  <div className="sc-home-step-track">
                    <span>{step.number}</span>
                    {index < steps.length - 1 && <i />}
                  </div>
                  <div className="sc-home-step-copy">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                  <Arrow diagonal />
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Section 6: Three primary portals: Hospital Admin, Doctor, and Patient */}
        <section id="portals" className="sc-home-section">
          <div className="sc-home-section-heading">
            <div>
              <Eyebrow>ONE PLATFORM, ROLE-AWARE ACCESS</Eyebrow>
              <h2>
                Three primary portals for
                <br />
                <span>synchronized healthcare delivery.</span>
              </h2>
            </div>
            <p>
              Hospital Admin authorizes doctors, doctors manage care plans and patient access, and patients execute recovery guidance with integrated family caregiving support.
            </p>
          </div>

          <div className="sc-home-feature-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {portalCards.map((portal) => (
              <PortalCard key={portal.number} {...portal} />
            ))}
          </div>
        </section>

        {/* Section 7: Trust, safety, and design principles section */}
        <section id="principles" className="sc-home-principles">
          <div className="sc-home-principles-art" aria-hidden="true">
            <div className="sc-home-principles-ring ring-one" />
            <div className="sc-home-principles-ring ring-two" />
            <div className="sc-home-principles-ring ring-three" />
            <span>SC</span>
          </div>

          <div className="sc-home-principles-copy">
            <Eyebrow>TECHNOLOGY WITH A HUMAN PURPOSE</Eyebrow>
            <h2>
              Designed to support care.
              <br />
              <span>Grounded in clarity.</span>
            </h2>
            <p>
              Good healthcare software should help people understand information and
              coordinate tasks—never add confusion. SmartCare is engineered around clinical safety,
              patient privacy, and verifiable execution.
            </p>

            <div className="sc-home-principle-list">
              {principles.map((p) => (
                <div key={p.number}>
                  <span>{p.number}</span>
                  <p>
                    <strong>{p.title}</strong>
                    <small>{p.description}</small>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 8: FAQ section */}
        <section id="faqs" className="sc-home-faq">
          <div className="sc-home-faq-heading">
            <Eyebrow>FREQUENTLY ASKED QUESTIONS</Eyebrow>
            <h2>
              A few things,
              <br />
              <span>made clear.</span>
            </h2>
            <p>Quick answers about the SmartCare platform and how it supports recovery.</p>
          </div>

          <div className="sc-home-faq-list">
            {faqs.map((faq, index) => (
              <details className="sc-home-faq-item" key={faq.question}>
                <summary>
                  <span className="sc-home-faq-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{faq.question}</span>
                  <span className="sc-home-faq-toggle" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA section */}
        <section className="sc-home-cta">
          <div className="sc-home-cta-glow" aria-hidden="true" />
          <div className="sc-home-cta-content">
            <Eyebrow>YOUR NEXT STEP STARTS HERE</Eyebrow>
            <h2>
              Bring recovery care
              <br />
              <span>into focus.</span>
            </h2>
            <p>
              Explore the dedicated workspaces, review active care plans,
              or preview coordinated patient follow-up.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/patient" className="sc-home-button-primary">
                Open Patient Portal <Arrow />
              </Link>
              <Link href="/clinical" className="sc-home-button-quiet">
                Clinical Workspace <Arrow />
              </Link>
            </div>
          </div>
          <div className="sc-home-cta-symbol" aria-hidden="true">
            ✳
          </div>
        </section>

        {/* Footer */}
        <footer className="sc-home-footer">
          <Brand />
          <p>
            Care, connected. A digital workspace for post-discharge care coordination and
            follow-up.
          </p>
          <div className="sc-home-footer-links">
            <Link href="/patient">Patient Portal</Link>
            <Link href="/clinical">Doctor Workspace</Link>
            <Link href="/caregiver">Caregiver Workspace</Link>
            <Link href="/admin">Hospital Administration</Link>
            <Link href="/research">Research Analytics</Link>
          </div>
          <small>
            Disclaimer: SmartCare supports post-discharge care plan coordination and does not
            replace professional medical advice, clinical diagnosis, or emergency medical services.
          </small>
        </footer>
      </div>
    </main>
  );
}
