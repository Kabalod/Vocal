import { landingCopy, landingFaq } from "@/lib/landing-content";

export function LandingFaq() {
  return (
    <div className="landing-faq">
      {landingFaq.map((item) => (
        <details key={item.id}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function ResultExample() {
  return (
    <article className="landing-result-frame">
      <div className="landing-result-paper">
        <h3>{landingCopy.resultCardTitle}</h3>
        <p>{landingCopy.resultCardBody}</p>
      </div>
      <span className="landing-marker">{landingCopy.resultMarker}</span>
    </article>
  );
}

export function FeedbackExample() {
  return (
    <article className="landing-card landing-card-feedback">
      <h3 className="landing-chat-label">{landingCopy.feedbackCardTitle}</h3>
      <div className="landing-feedback-row">
        <span className="landing-feedback-icon landing-feedback-keep" aria-hidden>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5.5 12.2 10 16.5 18.5 7.5" />
          </svg>
        </span>
        <div>
          <strong>{landingCopy.feedbackKeepTitle}</strong>
          <p>{landingCopy.feedbackKeep}</p>
        </div>
      </div>
      <div className="landing-feedback-row">
        <span className="landing-feedback-icon landing-feedback-try" aria-hidden>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6M10.2 21h3.6" />
            <path d="M8.2 14.4A5.2 5.2 0 1 1 15.8 14.4c-.7 1.1-1.6 1.7-1.6 2.8h-4.4c0-1.1-.9-1.7-1.6-2.8Z" />
          </svg>
        </span>
        <div>
          <strong>{landingCopy.feedbackTryTitle}</strong>
          <p>{landingCopy.feedbackTry}</p>
        </div>
      </div>
    </article>
  );
}
