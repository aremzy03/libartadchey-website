import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/container";
import { mainNav, primaryCta, siteConfig } from "@/lib/site";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-surface-container py-[var(--section-padding)] text-on-surface">
      <Container>
        <div className="mb-8 grid grid-cols-1 gap-8 border-b border-outline-variant pb-8 md:grid-cols-4 md:gap-8">
          <div className="md:col-span-1">
            <Link href="/" className="mb-4 inline-block">
              <Image
                src="/brand/LOGO 111.png"
                alt={siteConfig.name}
                width={2138}
                height={1658}
                className="h-16 w-auto object-contain"
              />
            </Link>
            <p className="font-sans text-base leading-relaxed text-on-surface-variant">
              Risk and audit consultancy. Founder-led expertise for
              organisations that want gaps found before they reach the
              financials.
            </p>
          </div>

          <div>
            <h2 className="font-display mb-4 text-xl font-semibold">
              Quick links
            </h2>
            <nav className="flex flex-col gap-2" aria-label="Footer">
              {mainNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="font-sans text-base text-on-surface-variant transition-colors hover:text-primary"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href={primaryCta.href}
                className="font-sans text-base font-semibold text-primary transition-colors hover:text-primary-container"
              >
                {primaryCta.label}
              </Link>
            </nav>
          </div>

          <div>
            <h2 className="font-display mb-4 text-xl font-semibold">Contact</h2>
            <div className="flex flex-col gap-2 font-sans text-base text-on-surface-variant">
              <a
                href={`mailto:${siteConfig.email}`}
                className="hover:text-primary transition-colors"
              >
                {siteConfig.email}
              </a>
              <span className="leading-snug">{siteConfig.location}</span>
            </div>
          </div>

          <div>
            <h2 className="font-display mb-4 text-xl font-semibold">Connect</h2>
            <a
              href={siteConfig.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-base text-on-surface-variant transition-colors hover:text-primary"
            >
              LinkedIn
            </a>
          </div>
        </div>

        <p className="text-center font-sans text-xs font-medium tracking-wide text-on-surface-variant">
          © {year}{" "}
          <span className="font-brand uppercase tracking-[0.06em] text-primary">
            {siteConfig.name}
          </span>
          . All rights reserved.
        </p>
      </Container>
    </footer>
  );
}
