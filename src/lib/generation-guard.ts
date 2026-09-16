export class GenerationGuard {
  private generation = 0;

  begin() {
    const token = ++this.generation;
    return {
      isCurrent: () => token === this.generation,
    };
  }
}
