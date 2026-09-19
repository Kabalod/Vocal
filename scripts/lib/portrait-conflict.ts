export class PortraitConflictError extends Error {
  readonly report: PortraitConflictReport;
  constructor(report: PortraitConflictReport) {
    super(
      `CreatorProfile conflict: legacy id "local" and owner ${report.ownerId} both exist. Stopped before changing data.`,
    );
    this.name = "PortraitConflictError";
    this.report = report;
  }
}

export type PortraitConflictReport = {
  ownerId: string;
  localPortrait: { id: string; ownerUserId: string; currentRevisionId: string | null; revisionCount: number } | null;
  ownerPortrait: { id: string; ownerUserId: string; currentRevisionId: string | null; revisionCount: number } | null;
};

export function reportPortraitConflict(input: {
  ownerId: string;
  local: { id: string; ownerUserId: string; currentRevisionId: string | null } | null;
  owner: { id: string; ownerUserId: string; currentRevisionId: string | null } | null;
  localRevisionCount: number;
  ownerRevisionCount: number;
}): PortraitConflictReport | null {
  if (!input.local || !input.owner) return null;
  return {
    ownerId: input.ownerId,
    localPortrait: {
      id: input.local.id,
      ownerUserId: input.local.ownerUserId,
      currentRevisionId: input.local.currentRevisionId,
      revisionCount: input.localRevisionCount,
    },
    ownerPortrait: {
      id: input.owner.id,
      ownerUserId: input.owner.ownerUserId,
      currentRevisionId: input.owner.currentRevisionId,
      revisionCount: input.ownerRevisionCount,
    },
  };
}
