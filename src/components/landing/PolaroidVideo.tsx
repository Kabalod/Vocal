"use client";

import {
  LANDING_DEMO_POSTER_ALT,
  LANDING_POSTER_SRC,
  LANDING_VIDEO_SRC,
  landingCopy,
} from "@/lib/landing-content";
import { useState } from "react";

export function PolaroidVideo() {
  const [failed, setFailed] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const hasVideo = Boolean(LANDING_VIDEO_SRC) && !failed;

  return (
    <figure className={`landing-polaroid${playing ? " is-playing" : ""}`}>
      <div className="landing-polaroid-frame">
        {hasVideo ? (
          <video
            className="landing-polaroid-media"
            controls
            playsInline
            preload="metadata"
            poster={LANDING_POSTER_SRC}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => {
              setFailed(true);
              setPlaying(false);
            }}
          >
            <source src={LANDING_VIDEO_SRC} />
            {landingCopy.videoError}
          </video>
        ) : (
          <button
            type="button"
            className="landing-polaroid-hit"
            onClick={() => setPendingOpen(true)}
            aria-label={failed ? landingCopy.videoError : landingCopy.videoPending}
          >
            <img
              className="landing-polaroid-media"
              src={LANDING_POSTER_SRC}
              alt={LANDING_DEMO_POSTER_ALT}
            />
          </button>
        )}
        {pendingOpen && !hasVideo ? (
          <div className="landing-polaroid-error">
            <p>{failed ? landingCopy.videoError : landingCopy.videoPending}</p>
            <span>{landingCopy.videoPendingHint}</span>
            {failed ? (
              <button type="button" className="landing-login" onClick={() => setFailed(false)}>
                {landingCopy.videoRetry}
              </button>
            ) : (
              <button type="button" className="landing-login" onClick={() => setPendingOpen(false)}>
                Закрыть
              </button>
            )}
          </div>
        ) : null}
      </div>
      <figcaption className="landing-polaroid-caption">{landingCopy.polaroidCaption}</figcaption>
    </figure>
  );
}
