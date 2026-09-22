import { LANDING_POSTER_SRC, landingConversation, landingCopy } from "@/lib/landing-content";

function AgentMark() {
  return (
    <span className="landing-avatar landing-avatar-agent" aria-hidden>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M12 3.2 13.55 10.1 20.8 12 13.55 13.9 12 20.8 10.45 13.9 3.2 12 10.45 10.1Z" />
      </svg>
    </span>
  );
}

export function ConversationDemo() {
  return (
    <div className="landing-chat">
      <p className="landing-chat-label">{landingCopy.conversationKicker}</p>
      <div role="list" aria-label={landingCopy.conversationKicker}>
      {landingConversation.map((item, index) => (
        <div
          key={`${item.role}-${index}`}
          role="listitem"
          className={`landing-row landing-row-${item.role}`}
        >
          {item.role === "agent" ? (
            <AgentMark />
          ) : (
            <img
              className="landing-avatar landing-avatar-photo"
              src={LANDING_POSTER_SRC}
              alt=""
            />
          )}
          <p className="landing-bubble">{item.text}</p>
        </div>
      ))}
      </div>
    </div>
  );
}
