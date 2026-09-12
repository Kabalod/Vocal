export type ScriptDraftPatchInput = {
  body: string;
  expectedUpdatedAt: string;
  expectedSaveToken: number;
};

export type ScriptDraftPatchOk = {
  draft: { body: string; updatedAt: string; saveToken: number };
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
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly deps: {
      patch: (input: ScriptDraftPatchInput) => Promise<ScriptDraftPatchOk>;
      onStale?: () => Promise<{ updatedAt: string; saveToken: number } | null>;
    },
  ) {}

  get buttonsDisabled() {
    return this.saving || this.finalizing;
  }

  hydrate(draft: { body: string; updatedAt: string; saveToken: number } | null, keepBody: boolean) {
    if (!draft) {
      this.savedBody = null;
      this.expectedUpdatedAt = null;
      this.expectedSaveToken = null;
      return;
    }
    this.savedBody = draft.body;
    this.expectedUpdatedAt = draft.updatedAt;
    this.expectedSaveToken = draft.saveToken;
    if (!keepBody) this.body = draft.body;
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
    return this.enqueue(() => this.saveNow());
  }

  private async saveNow(): Promise<ScriptDraftPatchOk | null> {
    if (this.expectedUpdatedAt == null || this.expectedSaveToken == null) return null;
    if (this.savedBody === this.body) {
      return {
        draft: {
          body: this.body,
          updatedAt: this.expectedUpdatedAt,
          saveToken: this.expectedSaveToken,
        },
      };
    }
    this.inflight += 1;
    this.saving = true;
    this.status = "Сохраняем…";
    try {
      const next = await this.deps.patch({
        body: this.body,
        expectedUpdatedAt: this.expectedUpdatedAt,
        expectedSaveToken: this.expectedSaveToken,
      });
      this.hydrate(next.draft, true);
      this.error = null;
      this.status = "Сохранено";
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
        throw new DraftSaveError(this.error, "STALE");
      }
      this.error = err instanceof Error ? err.message : "Ошибка.";
      this.status = null;
      throw err;
    } finally {
      this.inflight = Math.max(0, this.inflight - 1);
      this.saving = this.inflight > 0;
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
    try {
      await this.persist();
      this.mode = "ready";
    } catch {
      /* остаёмся в черновике; saving снимает finally */
    }
  }

  async finalize(submit: (input: ScriptDraftPatchInput & { body: string }) => Promise<void>) {
    this.finalizing = true;
    this.error = null;
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
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Ошибка.";
    } finally {
      this.finalizing = false;
    }
  }
}
