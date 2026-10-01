export type ProfileLockSeam = {
  afterCommitLocked?: () => Promise<void>;
  beforeSessionLock?: () => Promise<void>;
  afterLegacySessionWrite?: () => Promise<void>;
};

let seam: ProfileLockSeam = {};

export function setProfileLockSeamForTests(next: ProfileLockSeam) {
  seam = next;
}

export function resetProfileLockSeamForTests() {
  seam = {};
}

export async function afterCommitLockedForTests() {
  await seam.afterCommitLocked?.();
}

export async function beforeSessionLockForTests() {
  await seam.beforeSessionLock?.();
}

export async function afterLegacySessionWriteForTests() {
  await seam.afterLegacySessionWrite?.();
}
