import type { ReelDto, ReelStatus, UpdateReelInput } from "@/types/reel";

export type EditorSaveState = "idle" | "saving" | "saved" | "error";

export type EditorSaveFn = (patch: UpdateReelInput) => Promise<ReelDto>;
export type EditorLoadFn = () => Promise<ReelDto>;

type Dirty = { title: boolean; note: boolean; status: boolean };

export class ReelEditorSession {
  confirmed: ReelDto | null = null;
  draftTitle = "";
  draftNote = "";
  draftStatus: ReelStatus = "idea";
  saveState: EditorSaveState = "idle";
  saveError: string | null = null;
  conflict = false;

  private dirty: Dirty = { title: false, note: false, status: false };
  private inFlight = false;
  private queued = false;
  private disposed = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly saveFn: EditorSaveFn,
    private readonly loadFn: EditorLoadFn,
  ) {}

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  async bootstrap() {
    const reel = await this.loadFn();
    this.hydrate(reel);
  }

  hydrate(reel: ReelDto) {
    this.confirmed = reel;
    this.draftTitle = reel.title;
    this.draftNote = reel.initialNote;
    this.draftStatus = reel.status;
    this.dirty = { title: false, note: false, status: false };
    this.saveError = null;
    this.conflict = false;
    this.saveState = "idle";
    this.emit();
  }

  isDirty() {
    return this.dirty.title || this.dirty.note || this.dirty.status;
  }

  hasUnsavedWork() {
    return this.isDirty() || this.inFlight || this.queued;
  }

  setTitle(value: string) {
    this.draftTitle = value;
    this.dirty.title = true;
    if (this.saveState === "saved") this.saveState = "idle";
    this.emit();
  }

  setNote(value: string) {
    this.draftNote = value;
    this.dirty.note = true;
    if (this.saveState === "saved") this.saveState = "idle";
    this.emit();
  }

  setStatus(value: ReelStatus) {
    this.draftStatus = value;
    this.dirty.status = true;
    if (this.saveState === "saved") this.saveState = "idle";
    this.emit();
    this.requestSave();
  }

  requestSave() {
    this.queued = true;
    void this.drain();
  }

  retry() {
    this.conflict = false;
    this.saveError = null;
    this.requestSave();
  }

  dispose() {
    this.disposed = true;
  }

  private async drain() {
    if (this.inFlight) return;
    this.inFlight = true;
    while (this.queued) {
      this.queued = false;
      await this.saveOnce();
      if (this.disposed && !this.queued) break;
    }
    this.inFlight = false;
    this.emit();
  }

  private snapshotPatch(): UpdateReelInput | null {
    if (!this.isDirty()) return null;
    const patch: UpdateReelInput = {};
    if (this.dirty.title) patch.title = this.draftTitle;
    if (this.dirty.note) patch.initialNote = this.draftNote;
    if (this.dirty.status) patch.status = this.draftStatus;
    return patch;
  }

  private async saveOnce() {
    const patch = this.snapshotPatch();
    if (!patch || !this.confirmed) return;

    const sentTitle = patch.title;
    const sentNote = patch.initialNote;
    const sentStatus = patch.status;
    const version = this.confirmed.updatedAt;

    this.saveState = "saving";
    this.saveError = null;
    this.emit();

    try {
      const saved = await this.saveFn({ ...patch, expectedUpdatedAt: version });
      if (this.disposed) return;
      this.confirmed = saved;
      if (sentTitle !== undefined && this.draftTitle === sentTitle) this.dirty.title = false;
      if (sentNote !== undefined && this.draftNote === sentNote) this.dirty.note = false;
      if (sentStatus !== undefined && this.draftStatus === sentStatus) this.dirty.status = false;
      this.conflict = false;
      if (this.isDirty()) this.queued = true;
      this.saveState = this.isDirty() || this.queued ? "saving" : "saved";
    } catch (error) {
      if (this.disposed) return;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
      if (code === "STALE" || status === 409) {
        this.conflict = true;
        try {
          const latest = await this.loadFn();
          if (!this.disposed) this.confirmed = latest;
        } catch {
          /* версия могла не обновиться; черновик всё равно сохраняем */
        }
        this.saveState = "error";
        this.saveError =
          error instanceof Error ? error.message : "Карточка изменилась. Черновик на месте — повторите сохранение.";
      } else {
        this.saveState = "error";
        this.saveError = error instanceof Error ? error.message : "Нет связи. Черновик на месте — повторите сохранение.";
      }
    }
    this.emit();
  }
}

export function isBrowserLeaveWarningNeeded(session: ReelEditorSession) {
  return session.hasUnsavedWork();
}
