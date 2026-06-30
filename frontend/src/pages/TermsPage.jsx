import { useEffect } from "react";
import { Link } from "react-router-dom";

const SECTIONS = [
  {
    title: "1. Acceptance of terms",
    body: "By creating an account or browsing MobileHub, you agree to these Terms of Service and our Privacy Policy. If you do not agree, please do not use the service.",
  },
  {
    title: "2. Accounts",
    body: "You're responsible for keeping your password safe and for activity that happens under your account. We may suspend or close accounts that violate these terms or applicable law.",
  },
  {
    title: "3. Purchases & pricing",
    body: "All prices are listed in BDT (TK) and may change without notice. We reserve the right to refuse or cancel orders if a price was displayed incorrectly or stock has changed.",
  },
  {
    title: "4. Returns & refunds",
    body: "Unopened devices in original packaging can be returned within 14 days of delivery for a full refund. Opened devices are subject to a 10% restocking fee. See our Returns page for details.",
  },
  {
    title: "5. Use of the service",
    body: "Don't scrape, crawl, or otherwise automatedly collect data from MobileHub. Don't try to bypass rate limits, security controls, or any access restrictions we put in place.",
  },
  {
    title: "6. Intellectual property",
    body: "All product images, brand names, and editorial content on MobileHub are the property of their respective owners. You may not reproduce them without permission.",
  },
  {
    title: "7. Disclaimers",
    body: "The service is provided \"as is\" without warranties of any kind. We don't guarantee that product specs displayed will exactly match the manufacturer's documentation.",
  },
  {
    title: "8. Changes",
    body: "We may update these terms from time to time. Continued use of MobileHub after changes means you accept the updated terms.",
  },
];

export default function TermsPage() {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="container-page py-10 max-w-3xl">
      <div className="mb-6">
        <div className="eyebrow text-primary mb-1">Legal</div>
        <h1 className="text-headline-lg text-ink">Terms of service</h1>
        <p className="text-body-md text-ink-muted mt-2">
          Last updated: January 2025
        </p>
      </div>

      <div className="card p-6 space-y-6">
        <p className="text-body-md text-ink">
          Welcome to MobileHub. These terms govern your use of our website and
          services. Please read them carefully.
        </p>
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-title-md text-ink">{s.title}</h2>
            <p className="text-body-md text-ink-muted mt-1">{s.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-label-md">
        <Link to="/privacy" className="text-primary hover:underline">
          Read our privacy policy →
        </Link>
        <Link to="/register" className="text-ink-muted hover:text-ink">
          ← Back to sign up
        </Link>
      </div>
    </div>
  );
}