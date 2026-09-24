/** Mutable seams for V01 race tests. Production keeps these null. */
export const v01TestSeams = {
  afterWorkingTakeRead: null as (() => Promise<void>) | null,
  afterMaterialCheck: null as (() => Promise<void>) | null,
  afterLastMaterialCheck: null as (() => Promise<void>) | null,
};
