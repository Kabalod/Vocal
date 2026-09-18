import type { SVGProps } from "react";

/** One inline SVG family (stroke 1.6). Lucide is not installed — UI_SPEC asks not to add a font/icon package for the spec. */
const base = {
  className: "h-5 w-5 shrink-0",
  fill: "none",
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeWidth: 1.6,
  "aria-hidden": true as const,
};

export function IconMic(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8" />
    </svg>
  );
}

export function IconSend(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12 20 4l-6 16-2-7-8-1Z" />
    </svg>
  );
}

export function IconDownload(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4v12M7 12l5 5 5-5M5 20h14" />
    </svg>
  );
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

export function IconStatusAll(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="5" width="5.5" height="5.5" rx="1.2" />
      <rect x="13.5" y="5" width="5.5" height="5.5" rx="1.2" />
      <rect x="5" y="13.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="5.5" height="5.5" rx="1.2" />
    </svg>
  );
}

export function IconStatusOpen(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export function IconStatusProgress(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 5a7 7 0 0 1 7 7" />
    </svg>
  );
}

export function IconStatusDone(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="7" />
      <path d="M8 12.5 11 15.5 16 9" />
    </svg>
  );
}

export function IconUpload(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 20V8M7 12l5-5 5 5M5 4h14" />
    </svg>
  );
}
