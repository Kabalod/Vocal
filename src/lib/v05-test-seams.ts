/** Seams for V05 race tests. Production keeps these null. */
export const v05TestSeams = {
  afterCollectBeforeFreeze: null as (() => Promise<void>) | null,
  afterCommitBeforeWorkspace: null as (() => Promise<void>) | null,
  afterErrorClaim: null as (() => Promise<void>) | null,
};

export function resetV05TestSeams() {
  v05TestSeams.afterCollectBeforeFreeze = null;
  v05TestSeams.afterCommitBeforeWorkspace = null;
  v05TestSeams.afterErrorClaim = null;
}
