export interface LabelItem {
  key: number;
  text: string;
  selected: boolean;
  /** Extra CSS class (e.g. "has-planets"). */
  variant?: string;
}

/**
 * A fixed set of DOM label buttons reused for whatever is in view (no per-frame DOM creation).
 * Content changes a few times a second; positions every frame via transforms.
 */
export class LabelPool {
  private readonly buttons: HTMLButtonElement[] = [];
  private keys: (number | undefined)[] = [];
  private readonly variants: (string | undefined)[] = [];

  constructor(root: HTMLElement, count: number, private readonly className: string, signal: AbortSignal,
    handlers: { select: (key: number) => void; open: (key: number) => void }) {
    for (let i = 0; i < count; i++) {
      const button = document.createElement("button");
      button.className = className;
      button.hidden = true;
      const key = () => Number(button.dataset.key);
      button.addEventListener("click", () => { if (Number.isInteger(key())) handlers.select(key()); }, { signal });
      button.addEventListener("dblclick", () => { if (Number.isInteger(key())) handlers.open(key()); }, { signal });
      this.buttons.push(button);
      root.appendChild(button);
    }
  }

  /** Show these items (in priority order; extras beyond the pool are dropped). */
  assign(items: LabelItem[]): void {
    this.keys = this.buttons.map((button, slot) => {
      const item = items[slot];
      if (!item) {
        button.hidden = true;
        return undefined;
      }
      button.dataset.key = String(item.key);
      if (button.textContent !== item.text) button.textContent = item.text;
      button.classList.toggle("is-selected", item.selected);
      if (this.variants[slot] !== item.variant) {
        button.className = item.variant ? `${this.className} ${item.variant}` : this.className;
        button.classList.toggle("is-selected", item.selected);
        this.variants[slot] = item.variant;
      }
      return item.key;
    });
  }

  /** Position shown labels; `locate` returns CSS pixels for a key, or null to hide it. */
  place(locate: (key: number) => { x: number; y: number } | null): void {
    this.buttons.forEach((button, slot) => {
      const key = this.keys[slot];
      if (key === undefined) return;
      const at = locate(key);
      button.hidden = at === null;
      if (at) button.style.transform = `translate(${at.x + 10}px,${at.y - 8}px)`;
    });
  }
}
