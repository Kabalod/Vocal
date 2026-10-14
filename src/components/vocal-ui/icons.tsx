import type { SVGProps } from "react";
import { ArrowRight, Download, LayoutGrid, Mic, Plus, X } from "lucide-react";

/**
 * Icons of the interface: lucide-react (stroke 1.5, 20 px as before) for actions; the three status icons stay our own SVG in the
 * look of the prototype (16-unit circle, 1.5 stroke, half fill / check), coloured by the status tokens.
 */
const lucide = { className: "h-5 w-5 shrink-0", strokeWidth: 1.5, "aria-hidden": true as const };

type IconProps = Omit<SVGProps<SVGSVGElement>, "ref">;

export function IconMic(props: IconProps) {
  return <Mic {...lucide} {...props} />;
}

export function IconSend(props: IconProps) {
  return <ArrowRight {...lucide} {...props} />;
}

export function IconDownload(props: IconProps) {
  return <Download {...lucide} {...props} />;
}

export function IconPlus(props: IconProps) {
  return <Plus {...lucide} {...props} />;
}

export function IconClose(props: IconProps) {
  return <X {...lucide} {...props} />;
}

export function IconStatusAll(props: IconProps) {
  return <LayoutGrid {...lucide} {...props} />;
}

const status = {
  className: "h-4 w-4 shrink-0",
  fill: "none",
  viewBox: "0 0 16 16",
  stroke: "currentColor",
  strokeWidth: 1.5,
  "aria-hidden": true as const,
};

export function IconStatusOpen(props: IconProps) {
  return (
    <svg {...status} style={{ color: "var(--status-open)" }} {...props}>
      <circle cx="8" cy="8" r="6.25" />
    </svg>
  );
}

export function IconStatusProgress(props: IconProps) {
  return (
    <svg {...status} style={{ color: "var(--status-progress)" }} {...props}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 1.75a6.25 6.25 0 0 0 0 12.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconStatusDone(props: IconProps) {
  return (
    <svg {...status} style={{ color: "var(--status-done)" }} {...props}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="m5.3 8.2 1.9 1.9 3.6-3.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
