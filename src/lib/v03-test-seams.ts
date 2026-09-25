/** Mutable seams for V03 reducer and recovery tests. Production keeps these null. */
export const v03TestSeams = {
  afterUserMessageCreate: null as (() => Promise<void>) | null,
  failThoughtStateApply: null as (() => Promise<void>) | null,
};
