export type ScriptDraftPatchInput = {
  body: string;
  expectedUpdatedAt: string;
  expectedSaveToken: number;
};

export type ScriptDraftPatchOk = {
  draft: { body: string; updatedAt: string; saveToken: number };
};

export type ScriptDraftUiSnapshot = {
  version: number;
  mode: "ready" | "draft";
  body: string;
  saving: boolean;
  finalizing: boolean;
  error: string | null;
  status: string | null;
  expectedUpdatedAt: string | null;
  expectedSaveToken: number | null;
  buttonsDisabled: boolean;
};

export class DraftSaveError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DraftSaveError";
  }
}

export class ScriptDraftSaveSession {
  mode: "ready" | "draft" = "ready";
  body = "";
  savedBody: string | null = null;
  expectedUpdatedAt: string | null = null;
  expectedSaveToken: number | null = null;
  saving = false;
  finalizing = false;
  error: string | null = null;
  status: string | null = null;
  private inflight = 0;
  private saveArmed = false;
  private chain: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private snapshot: ScriptDraftUiSnapshot;
  private version = 0;
  private localEditVersion = 0;
  private hydratedEditVersion = 0;

  constructor(
    private readonly deps: {
      patch: (input: ScriptDraftPatchInput) => Promise<ScriptDraftPatchOk>;
      onStale?: () => Promise<{ updatedAt: string; saveToken: number } | null>;
    },
  ) {
    this.snapshot = this.buildSnapshot();
  }

  get buttonsDisabled() {
    return this.saving || this.finalizing;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  private buildSnapshot(): ScriptDraftUiSnapshot {
    return {
      version: this.version,
      mode: this.mode,
      body: this.body,
      saving: this.saving,
      finalizing: this.finalizing,
      error: this.error,
      status: this.status,
      expectedUpdatedAt: this.expectedUpdatedAt,
      expectedSaveToken: this.expectedSaveToken,
      buttonsDisabled: this.saving || this.finalizing,
    };
  }

  emit() {
    this.version += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  setBody(body: string) {
    this.body = body;
    this.localEditVersion += 1;
    this.emit();
  }

  hasUnsavedLocalEdits() {
    return this.localEditVersion > this.hydratedEditVersion || (this.savedBody !== null && this.body !== this.savedBody);
  }

  enterDraft() {
    this.mode = "draft";
    this.emit();
  }

  private hasLocalEditsBeforeServerAssign() {
    return this.localEditVersion > this.hydratedEditVersion || (this.savedBody !== null && this.body !== this.savedBody);
  }

  hydrate(draft: { body: string; updatedAt: string; saveToken: number } | null, keepBody: boolean) {
    if (!draft) {
      this.savedBody = null;
      this.expectedUpdatedAt = null;
      this.expectedSaveToken = null;
      this.emit();
      return;
    }
    const dirty = keepBody || this.hasLocalEditsBeforeServerAssign();
    this.savedBody = draft.body;
    this.expectedUpdatedAt = draft.updatedAt;
    this.expectedSaveToken = draft.saveToken;
    if (!dirty) {
      this.body = draft.body;
      this.hydratedEditVersion = this.localEditVersion;
    }
    this.emit();
  }

  applyPatchAck(draft: { body: string; updatedAt: string; saveToken: number }, sent: { body: string; localEditVersion: number }) {
    this.savedBody = sent.body;
    this.expectedUpdatedAt = draft.updatedAt;
    this.expectedSaveToken = draft.saveToken;
    if (this.localEditVersion > sent.localEditVersion) {
      this.emit();
      return;
    }
    this.body = sent.body;
    this.hydratedEditVersion = sent.localEditVersion;
    this.emit();
  }

  private beginSave() {
    if (this.saveArmed) return;
    this.saveArmed = true;
    this.inflight += 1;
    this.saving = true;
    this.status = "Сохраняем…";
    this.emit();
  }

  private endSave() {
    this.inflight = Math.max(0, this.inflight - 1);
    this.saveArmed = this.inflight > 0;
    this.saving = this.inflight > 0;
    this.emit();
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  save() {
    const sentBody = this.body;
    const sentEditVersion = this.localEditVersion;
    const expectedUpdatedAt = this.expectedUpdatedAt;
    const expectedSaveToken = this.expectedSaveToken;
    if (expectedUpdatedAt != null && expectedSaveToken != null && this.savedBody !== sentBody) {
      this.beginSave();
    }
    return this.enqueue(() =>
      this.saveNow({
        sentBody,
        sentEditVersion,
        expectedUpdatedAt,
        expectedSaveToken,
      }),
    );
  }

  private async saveNow(sent?: {
    sentBody: string;
    sentEditVersion: number;
    expectedUpdatedAt: string | null;
    expectedSaveToken: number | null;
  }): Promise<ScriptDraftPatchOk | null> {
    const expectedUpdatedAt = sent?.expectedUpdatedAt ?? this.expectedUpdatedAt;
    const expectedSaveToken = sent?.expectedSaveToken ?? this.expectedSaveToken;
    const sentBody = sent?.sentBody ?? this.body;
    const sentEditVersion = sent?.sentEditVersion ?? this.localEditVersion;
    if (expectedUpdatedAt == null || expectedSaveToken == null) return null;
    if (this.savedBody === sentBody && this.localEditVersion === sentEditVersion) {
      return {
        draft: {
          body: sentBody,
          updatedAt: expectedUpdatedAt,
          saveToken: expectedSaveToken,
        },
      };
    }
    this.beginSave();
    try {
      const next = await this.deps.patch({
        body: sentBody,
        expectedUpdatedAt,
        expectedSaveToken,
      });
      this.applyPatchAck(next.draft, { body: sentBody, localEditVersion: sentEditVersion });
      this.error = null;
      this.status = this.localEditVersion > sentEditVersion ? null : "Сохранено";
      this.emit();
      return next;
    } catch (err) {
      if (err instanceof DraftSaveError && err.code === "STALE") {
        const fresh = this.deps.onStale ? await this.deps.onStale() : null;
        if (fresh) {
          this.expectedUpdatedAt = fresh.updatedAt;
          this.expectedSaveToken = fresh.saveToken;
        }
        this.error = "Черновик уже изменился в другом окне. Текст здесь не потерян.";
        this.status = null;
        this.emit();
        throw new DraftSaveError(this.error, "STALE");
      }
      this.error = err instanceof Error ? err.message : "Ошибка.";
      this.status = null;
      this.emit();
      throw err;
    } finally {
      this.endSave();
    }
  }

  async persist() {
    if (this.expectedUpdatedAt == null || this.expectedSaveToken == null) return null;
    if (this.savedBody === this.body) {
      return { updatedAt: this.expectedUpdatedAt, saveToken: this.expectedSaveToken };
    }
    const next = await this.save();
    if (!next?.draft) return null;
    return { updatedAt: next.draft.updatedAt, saveToken: next.draft.saveToken };
  }

  async backToReady() {
    this.error = null;
    if (this.savedBody !== this.body) this.beginSave();
    this.emit();
    try {
      await this.persist();
      this.mode = "ready";
      this.emit();
    } catch {
      /* остаёмся в черновике; saving снимает finally */
    }
  }

  async finalize(submit: (input: ScriptDraftPatchInput & { body: string }) => Promise<void>) {
    if (this.finalizing) return;
    this.finalizing = true;
    this.error = null;
    this.emit();
    try {
      const persisted = await this.persist();
      if (!persisted || !this.body.trim()) return;
      await submit({
        body: this.body,
        expectedUpdatedAt: persisted.updatedAt,
        expectedSaveToken: persisted.saveToken,
      });
      this.mode = "ready";
      this.status = "Готовая версия создана.";
      this.emit();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Ошибка.";
      this.emit();
    } finally {
      this.finalizing = false;
      this.emit();
    }
  }
}
