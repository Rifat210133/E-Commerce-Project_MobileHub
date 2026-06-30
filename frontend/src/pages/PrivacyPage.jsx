import { useEffect } from "react";
import { Link } from "react-router-dom";

const SECTIONS = [
  {
    title: "1. What we collect",
    body: "Account data (name, email, phone, addresses), order history, wishlist, and basic device info so the site works on your phone or laptop.",
  },
  {
    title: "2. How we use it",
    body: "To create your account, process orders, show personalized recommendations, prevent fraud, and send you service-related updates. We don't sell your data.",
  },
  {
    title: "3. Cookies",
    body: "We use a small set of cookies to keep you signed in and remember your preferences. You can clear them from your browser at any time.",
  },
  {
    title: "4. Payments",
    body: "Card details are processed by our PCI-compliant payment provider and never touch our servers. We only store the last four digits and brand for receipts.",
  },
  {
    title: "5. Sharing",
    body: "We share data with shipping carriers, fraud-prevention services, and our hosting provider solely to operate MobileHub. We don't share with advertisers.",
  },
  {
    title: "6. Security",
    body: "Passwords are hashed with bcrypt. Traffic is encrypted with TLS. Access to customer data is limited to staff who need it to support you.",
  },
  {
    title: "7. Your rights",
    body: "You can access, update, or delete your data from your profile page, or by emailing privacy@mobilehub.local. Deletion is permanent and takes up to 30 days.",
  },
  {
    title: "8. Changes",
    body: "If we make material changes to this policy, we'll let you know by email and a banner on the site before they take effect.",
  },
];

export default function PrivacyPage() {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="container-page py-10 max-w-3xl">
      <div className="mb-6">
        <div className="eyebrow text-primary mb-1">Legal</div>
        <h1 className="text-headline-lg text-ink">Privacy policy</h1>
        <p className="text-body-md text-ink-muted mt-2">
          Last updated: January 2025
        </p>
      </div>

      <div className="card p-6 space-y-6">
        <p className="text-body-md text-ink">
          MobileHub respects your privacy. This policy explains what data we
          collect, why, and what choices you have.
        </p>
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-title-md text-ink">{s.title}</h2>
            <p className="text-body-md text-ink-muted mt-1">{s.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-label-md">
        <Link to="/terms" className="text-primary hover:underline">
          Read our terms of service →
        </Link>
        <Link to="/register" className="text-ink-muted hover:text-ink">
          ← Back to sign up
        </Link>
      </div>
    </div>
  );
}