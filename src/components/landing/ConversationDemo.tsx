"use client";

import { useState } from "react";
import {
  LANDING_AVATAR_SRC,
  landingCopy,
  landingDesktopConversation,
  landingMobileConversation,
} from "@/lib/landing-content";

function AgentMark() {
  return (
    <span className="landing-avatar landing-avatar-agent" aria-hidden>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M12 3.2 13.55 10.1 20.8 12 13.55 13.9 12 20.8 10.45 13.9 3.2 12 10.45 10.1Z" />
      </svg>
    </span>
  );
}

function UserMark() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="landing-avatar landing-avatar-fallback" aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="8.2" r="3.1" />
          <path d="M5.4 18.6c1.1-3 3.4-4.5 6.6-4.5s5.5 1.5 6.6 4.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  return (
    <img
      className="landing-avatar landing-avatar-photo"
      src={LANDING_AVATAR_SRC}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

function ConversationMessages({
  items,
  className,
}: {
  items: readonly { role: "user" | "agent"; text: string }[];
  className: string;
}) {
  return (
    <div className={className} role="list">
      {items.map((item, index) => (
        <div
          key={`${item.role}-${index}`}
          role="listitem"
          className={`landing-row landing-row-${item.role}`}
        >
          {item.role === "agent" ? <AgentMark /> : <UserMark />}
          <p className="landing-bubble">{item.text}</p>
        </div>
      ))}
    </div>
  );
}

export function ConversationDemo() {
  return (
    <div className="landing-chat">
      <p className="landing-chat-label">{landingCopy.conversationKicker}</p>
      <ConversationMessages items={landingMobileConversation} className="landing-chat-mobile" />
      <ConversationMessages items={landingDesktopConversation} className="landing-chat-desktop" />
    </div>
  );
}
