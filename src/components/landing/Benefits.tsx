import { landingBenefits } from "@/lib/landing-content";

function BenefitIcon({ id }: { id: string }) {
  if (id === "dialogue") {
    return (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.8 8.2A4.4 4.4 0 0 1 9.2 3.8h5.6A4.4 4.4 0 0 1 19.2 8.2v4.6A4.4 4.4 0 0 1 14.8 17.2H10l-4.8 3.2V8.2Z" />
      </svg>
    );
  }
  if (id === "style") {
    return (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.2 3.2h7.6L19.8 8.2v12.6H7.2V3.2Z" />
        <path d="M14.8 3.2v5h5" />
        <path d="M10.2 12.2h6M10.2 15.6h4.2" />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M6.5 18.2v-5.2M12 18.2V6.8M17.5 18.2v-8" />
    </svg>
  );
}

export function Benefits() {
  return (
    <ul className="landing-benefits">
      {landingBenefits.map((item) => (
        <li key={item.id} className="landing-benefit">
          <BenefitIcon id={item.id} />
          <div className="landing-benefit-copy">
            <h3>
              <span className="mobile-title">{item.mobileTitle}</span>
              <span className="desktop-title">{item.desktopTitle}</span>
            </h3>
            <p>
              <span className="mobile-title">{item.text}</span>
              <span className="desktop-title">{item.desktopText}</span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
