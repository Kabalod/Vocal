import { landingBenefits } from "@/lib/landing-content";

function BenefitIcon({ id }: { id: string }) {
  if (id === "dialogue") {
    return (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 17.7 4.2 20.2V7.8A3.3 3.3 0 0 1 7.5 4.5h9A3.3 3.3 0 0 1 19.8 7.8v6.1A3.3 3.3 0 0 1 16.5 17.2H7.5Z" />
      </svg>
    );
  }
  if (id === "style") {
    return (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4.5h6.2L19 9.3V19.5H8A1.5 1.5 0 0 1 6.5 18V6A1.5 1.5 0 0 1 8 4.5Z" />
        <path d="M14.1 4.5v4.2H19" />
        <path d="M9.6 12.6h6.2M9.6 15.8h4.4" />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.2 18.6V12M12 18.6V6.4M17.8 18.6v-8.4" />
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
