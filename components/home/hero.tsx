import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/container";
import { siteConfig } from "@/lib/site";

const brandValues = ["Intelligence", "Integrity", "Insight"] as const;

const methodSteps = [
  { title: "Process mapping", desc: "Uncovering invisible workflow gaps" },
  { title: "Control testing", desc: "Stress-testing internal controls" },
  { title: "Risk mitigation", desc: "Preventing financial exposure early" },
  { title: "Compliance advisory", desc: "Aligning with CAMA and IFRS standards" },
  { title: "Actionable outcomes", desc: "Bespoke SOPs and institutional resilience" },
] as const;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function HomeHero() {
  return (
    <section className="relative flex min-h-[min(92svh,54rem)] flex-col overflow-hidden bg-surface">
      {/* Background Radial & Architectural Wireframe Brand Motif */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_92%_8%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_58%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_-5%_95%,color-mix(in_oklab,var(--secondary-container)_38%,transparent),transparent_52%)]" />

        {/* Official Wireframe Brand Mark (LOGO 222) — Ambient Glow & Floating Motion */}
        <div className="home-shield-animated pointer-events-none absolute -right-[12%] top-[4%] hidden w-[58%] max-w-[48rem] select-none lg:block">
          <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary)_18%,transparent)_0%,color-mix(in_oklab,var(--brand-gold)_8%,transparent)_55%,transparent_75%)] blur-2xl" />
          <Image
            src="/brand/LOGO 222.png"
            alt=""
            width={2138}
            height={1659}
            className="relative h-auto w-full object-contain opacity-35 [filter:drop-shadow(0_0_1px_var(--primary))_drop-shadow(0_0_18px_color-mix(in_oklab,var(--primary)_22%,transparent))]"
          />
        </div>
      </div>

      <Container className="relative z-10 flex flex-1 flex-col justify-center py-12 sm:py-14 lg:py-16">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Left Hero Story */}
          <div className="relative flex flex-col gap-5 lg:col-span-7 lg:gap-6">
            <div className="home-rise home-delay-1 flex items-center gap-3.5 sm:gap-4">
              <span className="relative inline-block h-14 w-[3.89rem] shrink-0 overflow-hidden sm:h-[4.5rem] sm:w-[5rem]">
                <Image
                  src="/brand/LOGO 111.png"
                  alt=""
                  width={2138}
                  height={1658}
                  className="h-[118.68%] w-[137.76%] max-w-none -translate-x-[14.78%] object-contain"
                  priority
                />
              </span>
              <p className="font-display text-[clamp(2rem,5vw,3.75rem)] font-bold leading-[1.02] tracking-[-0.02em] text-primary">
                {siteConfig.shortName}
              </p>
            </div>

            <h1 className="home-rise home-delay-2 font-display max-w-[17ch] text-[clamp(1.85rem,4.2vw,3.35rem)] font-bold leading-[1.08] tracking-[-0.02em] text-on-surface">
              Uncovering process loopholes{" "}
              <span className="font-light italic text-secondary">before</span>{" "}
              they reach your financials.
            </h1>

            <p className="home-rise home-delay-3 max-w-[42ch] font-sans text-base leading-relaxed text-on-surface-variant sm:text-lg">
              Founder-led risk management, process audits, and compliance
              advisory for startups, SMEs, corporates, and NGOs.
            </p>

            <div className="home-rise home-delay-4 flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:gap-4">
              <Link
                href="/contact"
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-secondary-container px-8 py-3.5 font-sans text-sm font-semibold tracking-[0.05em] text-on-secondary-container transition-[filter,box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-[0_8px_24px_rgba(184,150,12,0.25)] hover:brightness-105 ${focusRing}`}
              >
                Book a consultation
                <ArrowIcon />
              </Link>
              <Link
                href="/services"
                className={`inline-flex min-h-12 items-center justify-center rounded-lg px-8 py-3.5 font-sans text-sm font-semibold tracking-[0.05em] text-primary-container shadow-[inset_0_0_0_1px_currentColor] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-surface-container ${focusRing}`}
              >
                Explore services
              </Link>
            </div>
          </div>

          {/* Right: five-step method, set in the same hairline idiom as the Services page */}
          <aside
            aria-labelledby="home-method-heading"
            className="home-fade home-delay-5 lg:col-span-5"
          >
            <h2
              id="home-method-heading"
              className="font-display text-[clamp(1.35rem,2vw,1.6rem)] font-semibold leading-[1.25] tracking-[-0.01em] text-primary"
            >
              5-step risk &amp; process assurance
            </h2>
            <p className="mt-2 max-w-[38ch] font-sans text-sm leading-relaxed text-on-surface-variant">
              Upstream root-cause methodology applied directly to your controls.
            </p>

            <ol className="mt-6 border-l border-outline-variant/60">
              {methodSteps.map((item, index) => (
                <li
                  key={item.title}
                  className="relative grid grid-cols-[2.25rem_1fr] items-baseline gap-4 border-b border-outline-variant/40 py-4 pl-6 last:border-b-0"
                >
                  <span
                    aria-hidden
                    className="absolute -left-[4.5px] top-[1.7rem] h-2 w-2 rounded-full bg-brand-gold"
                  />
                  <span className="font-display text-lg font-semibold tabular-nums lining-nums text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="font-sans text-[0.95rem] font-semibold text-on-surface">
                      {item.title}
                    </p>
                    <p className="mt-0.5 font-sans text-sm leading-relaxed text-on-surface-variant">
                      {item.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-6 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-secondary">
              ACA · CIA · M.Sc · ISO 31000
            </p>
          </aside>
        </div>
      </Container>
    </section>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
