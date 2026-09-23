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
      <div className="landing-result-sheet">
        <div className="landing-result-paper">
          <h3>{landingCopy.resultCardTitle}</h3>
          <p>{landingCopy.resultCardBody}</p>
        </div>
      </div>
      <span className="landing-marker">{landingCopy.resultMarker}</span>
    </article>
  );
}

export function FeedbackMobileCard() {
  return (
    <article className="landing-feedback-mobile landing-mobile-only">
      <h2 className="landing-feedback-mobile-title">{landingCopy.feedbackMobileTitle}</h2>
      <div className="landing-feedback-row">
        <span className="landing-feedback-icon landing-feedback-keep" aria-hidden>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5.4 12.3 10 16.7 18.6 7.4" />
          </svg>
        </span>
        <div>
          <strong>{landingCopy.feedbackMobileKeepTitle}</strong>
          <p>{landingCopy.feedbackMobileKeep}</p>
        </div>
      </div>
      <div className="landing-feedback-row">
        <span className="landing-feedback-icon landing-feedback-try" aria-hidden>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6M10.2 21h3.6" />
            <path d="M8.1 14.3A5.3 5.3 0 1 1 15.9 14.3c-.7 1.15-1.6 1.75-1.6 2.9h-4.6c0-1.15-.9-1.75-1.6-2.9Z" />
          </svg>
        </span>
        <div>
          <strong>{landingCopy.feedbackMobileTryTitle}</strong>
          <p>{landingCopy.feedbackMobileTry}</p>
        </div>
      </div>
    </article>
  );
}

export function FeedbackExample() {
  return (
    <article className="landing-feedback-panel">
      <p className="landing-feedback-label">{landingCopy.feedbackCardTitle}</p>
      <div className="landing-feedback-list">
        <div className="landing-feedback-row">
          <span className="landing-feedback-icon landing-feedback-keep" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5.4 12.3 10 16.7 18.6 7.4" />
            </svg>
          </span>
          <div>
            <strong>{landingCopy.feedbackKeepTitle}</strong>
            <p>{landingCopy.feedbackKeep}</p>
          </div>
        </div>
        <div className="landing-feedback-row">
          <span className="landing-feedback-icon landing-feedback-try" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6M10.2 21h3.6" />
              <path d="M8.1 14.3A5.3 5.3 0 1 1 15.9 14.3c-.7 1.15-1.6 1.75-1.6 2.9h-4.6c0-1.15-.9-1.75-1.6-2.9Z" />
            </svg>
          </span>
          <div>
            <strong>{landingCopy.feedbackTryTitle}</strong>
            <p>{landingCopy.feedbackTry}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
