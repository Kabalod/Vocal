import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceCardsDir = join(root, "scripts", "p01-6-0-assets", "cards");
const sourceDeskDir = join(root, "scripts", "p01-6-0-assets", "desk");
const cardsDir = join(root, "public", "archive", "cards");
const deskDir = join(root, "public", "archive", "desk");

mkdirSync(sourceCardsDir, { recursive: true });
mkdirSync(sourceDeskDir, { recursive: true });
mkdirSync(cardsDir, { recursive: true });
mkdirSync(deskDir, { recursive: true });

const cards = [
  {
    id: "01",
    shapes: `
      <rect width="768" height="1024" fill="#1A1228"/>
      <ellipse cx="180" cy="220" rx="340" ry="280" fill="#3D2A6B" opacity="0.72"/>
      <ellipse cx="620" cy="780" rx="300" ry="260" fill="#0B0714" opacity="0.78"/>
      <path d="M0 640 C220 520 420 860 768 700 L768 1024 L0 1024 Z" fill="#8B7CFF" opacity="0.16"/>
    `,
  },
  {
    id: "02",
    shapes: `
      <rect width="768" height="1024" fill="#120A1C"/>
      <path d="M-40 80 L820 240 L700 1100 L-80 860 Z" fill="#2A1F3D"/>
      <ellipse cx="520" cy="300" rx="260" ry="210" fill="#8B7CFF" opacity="0.22"/>
      <ellipse cx="140" cy="860" rx="280" ry="180" fill="#C4B5FD" opacity="0.12"/>
    `,
  },
  {
    id: "03",
    shapes: `
      <rect width="768" height="1024" fill="#0B0714"/>
      <circle cx="384" cy="430" r="340" fill="#1A1228"/>
      <circle cx="384" cy="430" r="220" fill="#2A1F3D"/>
      <circle cx="384" cy="430" r="110" fill="#3D2A6B" opacity="0.85"/>
      <ellipse cx="384" cy="900" rx="420" ry="160" fill="#8B7CFF" opacity="0.1"/>
    `,
  },
  {
    id: "04",
    shapes: `
      <rect width="768" height="1024" fill="#1A1228"/>
      <ellipse cx="210" cy="360" rx="250" ry="310" fill="#3D2A6B"/>
      <ellipse cx="590" cy="620" rx="270" ry="300" fill="#2A1F3D"/>
      <ellipse cx="400" cy="200" rx="180" ry="120" fill="#C4B5FD" opacity="0.14"/>
    `,
  },
  {
    id: "05",
    shapes: `
      <rect width="768" height="1024" fill="#0B0714"/>
      <rect y="0" width="768" height="240" fill="#2A1F3D"/>
      <rect y="240" width="768" height="280" fill="#1A1228"/>
      <rect y="520" width="768" height="260" fill="#3D2A6B" opacity="0.7"/>
      <rect y="780" width="768" height="244" fill="#120A1C"/>
      <path d="M0 500 C260 430 500 610 768 540 L768 700 L0 640 Z" fill="#8B7CFF" opacity="0.12"/>
    `,
  },
  {
    id: "06",
    shapes: `
      <rect width="768" height="1024" fill="#120A1C"/>
      <ellipse cx="720" cy="80" rx="320" ry="280" fill="#8B7CFF" opacity="0.28"/>
      <ellipse cx="80" cy="980" rx="360" ry="240" fill="#0B0714"/>
      <path d="M80 140 C300 220 360 620 180 900" stroke="#C4B5FD" stroke-width="48" opacity="0.08" fill="none"/>
    `,
  },
  {
    id: "07",
    shapes: `
      <rect width="768" height="1024" fill="#1A1228"/>
      <path d="M768 0 L768 420 L0 820 L0 0 Z" fill="#2A1F3D"/>
      <path d="M0 700 L768 280 L768 1024 L0 1024 Z" fill="#0B0714" opacity="0.72"/>
      <ellipse cx="260" cy="260" rx="200" ry="160" fill="#62DBC6" opacity="0.08"/>
    `,
  },
  {
    id: "08",
    shapes: `
      <rect width="768" height="1024" fill="#0B0714"/>
      <rect width="384" height="1024" fill="#1A1228"/>
      <ellipse cx="384" cy="512" rx="220" ry="340" fill="#3D2A6B" opacity="0.8"/>
      <ellipse cx="120" cy="180" rx="160" ry="140" fill="#8B7CFF" opacity="0.16"/>
      <ellipse cx="640" cy="860" rx="170" ry="150" fill="#C4B5FD" opacity="0.1"/>
    `,
  },
  {
    id: "09",
    shapes: `
      <rect width="768" height="1024" fill="#1A1228"/>
      <ellipse cx="400" cy="180" rx="420" ry="180" fill="#2A1F3D"/>
      <path d="M-20 380 C200 300 280 560 120 820 C40 980 260 1040 420 880 C620 680 820 860 780 1024 L-20 1024 Z" fill="#0B0714"/>
      <ellipse cx="560" cy="640" rx="200" ry="260" fill="#62DBC6" opacity="0.07"/>
    `,
  },
  {
    id: "10",
    shapes: `
      <rect width="768" height="1024" fill="#120A1C"/>
      <ellipse cx="384" cy="720" rx="460" ry="360" fill="#3D2A6B" opacity="0.55"/>
      <ellipse cx="260" cy="300" rx="240" ry="260" fill="#8B7CFF" opacity="0.2"/>
      <ellipse cx="540" cy="380" rx="180" ry="220" fill="#C4B5FD" opacity="0.12"/>
      <rect width="768" height="1024" fill="url(#fade10)"/>
    `,
    extras: `
      <linearGradient id="fade10" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0B0714" stop-opacity="0.15"/>
        <stop offset="1" stop-color="#0B0714" stop-opacity="0.45"/>
      </linearGradient>
    `,
  },
];

function cardSvg(card) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024" role="img" aria-hidden="true">
  <defs>
    <filter id="grain${card.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${Number(card.id)}" result="n"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.18"/>
      </feComponentTransfer>
    </filter>
    ${card.extras ?? ""}
  </defs>
  ${card.shapes}
  <rect width="768" height="1024" filter="url(#grain${card.id})" opacity="0.35"/>
</svg>
`;
}

const deskSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1200" viewBox="0 0 1920 1200" role="img" aria-hidden="true">
  <defs>
    <linearGradient id="deskWash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0B0714"/>
      <stop offset="0.45" stop-color="#1A1228"/>
      <stop offset="1" stop-color="#120A1C"/>
    </linearGradient>
    <filter id="deskGrain" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed="18"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.22"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="1920" height="1200" fill="url(#deskWash)"/>
  <ellipse cx="240" cy="180" rx="520" ry="280" fill="#8B7CFF" opacity="0.05"/>
  <ellipse cx="1680" cy="1040" rx="480" ry="260" fill="#2A1F3D" opacity="0.55"/>
  <rect width="1920" height="1200" filter="url(#deskGrain)" opacity="0.28"/>
</svg>
`;

for (const card of cards) {
  writeFileSync(join(sourceCardsDir, `${card.id}.svg`), cardSvg(card));
}
writeFileSync(join(sourceDeskDir, "desk.svg"), deskSvg);

function findBinary(names) {
  for (const name of names) {
    const probe = spawnSync(name, ["-version"], { encoding: "utf8" });
    if (probe.status === 0 || probe.status === 1) return name;
  }
  return null;
}

const ffmpeg = findBinary(["ffmpeg", "ffmpeg.exe"]);
if (ffmpeg) {
  const jobs = [
    ...cards.map((card) => ({
      in: join(sourceCardsDir, `${card.id}.svg`),
      out: join(cardsDir, `${card.id}.webp`),
      size: "768:1024",
    })),
    { in: join(sourceDeskDir, "desk.svg"), out: join(deskDir, "desk.webp"), size: "1920:1200" },
  ];
  for (const job of jobs) {
    const result = spawnSync(
      ffmpeg,
      ["-y", "-width", job.size.split(":")[0], "-height", job.size.split(":")[1], "-i", job.in, "-frames:v", "1", job.out],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      const lavfi = spawnSync(
        ffmpeg,
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=0x1A1228:s=${job.size.replace(":", "x")}`,
          "-frames:v",
          "1",
          "-c:v",
          "libwebp",
          "-quality",
          "78",
          job.out,
        ],
        { encoding: "utf8" },
      );
      if (lavfi.status !== 0) {
        console.warn(`webp skip ${job.out}: ${result.stderr || lavfi.stderr}`);
      }
    }
  }
}

console.log("wrote archive svg assets", cards.length + 1);
