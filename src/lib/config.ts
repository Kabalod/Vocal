import { MAX_UPLOAD_MB as DEFAULT_MAX_MB, MAX_VIDEO_SECONDS as DEFAULT_MAX_SEC } from "@/lib/constants";

export {
  ALLOWED_AUDIO_EXTENSIONS,
  ALLOWED_AUDIO_MIME,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME,
  BROWSER_AUDIO_EXTENSIONS,
  BROWSER_VIDEO_EXTENSIONS,
} from "@/lib/constants";

export const MAX_VIDEO_SECONDS = Number(process.env.MAX_VIDEO_SECONDS ?? DEFAULT_MAX_SEC);
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? DEFAULT_MAX_MB);
export const STT_MODEL = process.env.STT_MODEL ?? "whisper-large-v3-turbo";
export const STT_FALLBACK_MODEL = "whisper-large-v3";
export const LLM_MODEL = process.env.LLM_MODEL ?? "openai/gpt-oss-120b";
export const LLM_FALLBACK_MODEL = "openai/gpt-oss-20b";
