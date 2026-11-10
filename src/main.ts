import { Component, Plugin } from "obsidian";
import { createVerifier, isPasswordVerifier, PasswordVerifier, verifyPassword } from "./password";

const storageKey = "vault-screen-lock:verifier";

export default class VaultScreenLock extends Plugin {
  private readonly screens = new Map<Window, LockScreen>();
  private verifier: PasswordVerifier | null | undefined;
  private locked = true;
  private lockGeneration = 0;
  private disposed = false;

  onload(): void {
    try {
      const value: unknown = this.app.loadLocalStorage(storageKey);
      this.verifier = value === null || isPasswordVerifier(value) ? value : undefined;
    } catch {
      this.verifier = undefined;
    }

    const workspace = this.app.workspace;
    this.registerEvent(workspace.on("window-open", (_item, win) => this.watchWindow(win)));
    this.registerEvent(workspace.on("window-close", (_item, win) => {
      const screen = this.screens.get(win);
      if (screen) this.removeChild(screen);
      this.screens.delete(win);
    }));

    this.watchWindow(window);
    workspace.onLayoutReady(() => {
      if (this.disposed) return;
      workspace.iterateAllLeaves((leaf) => this.watchWindow(leaf.view.containerEl.win));
    });
  }

  onunload(): void {
    this.disposed = true;
    this.screens.clear();
  }

  private watchWindow(win: Window): void {
    if (this.screens.has(win)) return;

    const screen = new LockScreen(win, () => this.lock(), (password, confirmation) =>
      this.submit(password, confirmation));
    this.screens.set(win, screen);
    this.addChild(screen);
    if (this.locked) screen.show(this.verifier);
  }

  private lock(): void {
    // Invalidate an unlock already being checked when the app backgrounds again.
    this.lockGeneration++;
    this.locked = true;
    for (const screen of this.screens.values()) screen.show(this.verifier);
  }

  private async submit(password: string, confirmation: string): Promise<string | undefined> {
    if (!this.locked || this.verifier === undefined) return;

    const generation = this.lockGeneration;
    const existing = this.verifier;
    if (!existing && password !== confirmation) return "Passwords do not match.";

    try {
      const created = existing ? null : await createVerifier(password);
      const verified = existing ? await verifyPassword(password, existing) : true;
      if (this.disposed || generation !== this.lockGeneration || !this.locked) return;
      if (!verified) return "Incorrect password.";

      if (created) {
        this.app.saveLocalStorage(storageKey, created);
        this.verifier = created;
      }
      this.locked = false;
      for (const screen of this.screens.values()) screen.hide();
    } catch {
      if (generation === this.lockGeneration) {
        return "Could not check or save the password on this device.";
      }
    }
  }
}

class LockScreen extends Component {
  private readonly dialog: HTMLDialogElement;
  private readonly form: HTMLFormElement;
  private readonly heading: HTMLHeadingElement;
  private readonly password: HTMLInputElement;
  private readonly confirmation: HTMLInputElement;
  private readonly button: HTMLButtonElement;
  private readonly status: HTMLParagraphElement;
  private shouldShow = false;
  private formGeneration = 0;

  constructor(
    private readonly win: Window,
    private readonly onBackground: () => void,
    private readonly onSubmit: (password: string, confirmation: string) => Promise<string | undefined>,
  ) {
    super();
    const doc = win.document;
    this.dialog = doc.createElement("dialog");
    this.dialog.className = "vault-screen-lock";
    this.dialog.setAttribute("aria-labelledby", "vault-screen-lock-title");
    this.form = this.dialog.createEl("form", { cls: "vault-screen-lock-form" });
    this.heading = this.form.createEl("h1", { attr: { id: "vault-screen-lock-title" } });
    this.password = this.addPasswordField("Password");
    this.confirmation = this.addPasswordField("Confirm password");
    this.button = this.form.createEl("button", { attr: { type: "submit" } });
    this.status = this.form.createEl("p", { attr: { role: "status" } });
  }

  onload(): void {
    const doc = this.win.document;
    this.registerDomEvent(doc, "visibilitychange", () => {
      if (doc.hidden) this.onBackground();
    });
    this.registerDomEvent(this.win, "pagehide", this.onBackground);
    this.registerDomEvent(this.win, "blur", this.onBackground);

    // Stop global application shortcuts while allowing native input and form submission.
    const blockShortcuts = (event: KeyboardEvent) => {
      if (!this.shouldShow) return;
      event.stopImmediatePropagation();
      if (event.key === "Escape") event.preventDefault();
    };
    this.registerDomEvent(this.win, "keydown", blockShortcuts, { capture: true });
    this.registerDomEvent(this.win, "keyup", blockShortcuts, { capture: true });
    this.registerDomEvent(this.dialog, "cancel", (event) => event.preventDefault());
    this.registerDomEvent(this.form, "submit", (event) => {
      event.preventDefault();
      void this.checkPassword();
    });

    if (!doc.body) this.registerDomEvent(doc, "DOMContentLoaded", () => this.open());
  }

  onunload(): void {
    this.hide();
    this.dialog.remove();
  }

  show(verifier: PasswordVerifier | null | undefined): void {
    this.shouldShow = true;
    const setup = verifier === null;
    const unavailable = verifier === undefined;

    this.formGeneration++;
    this.form.reset();
    this.password.autocomplete = setup ? "new-password" : "current-password";
    this.password.disabled = unavailable;
    this.confirmation.parentElement!.hidden = !setup;
    this.confirmation.disabled = !setup;
    this.button.disabled = unavailable;
    this.heading.textContent = setup ? "Set a vault password" : "Vault locked";
    this.button.textContent = setup ? "Set password" : "Unlock";
    this.status.textContent = unavailable ? "The saved password settings could not be read." : "";
    this.open();
  }

  hide(): void {
    this.shouldShow = false;
    this.formGeneration++;
    this.form.reset();
    this.dialog.close();
  }

  private open(): void {
    if (!this.shouldShow || this.dialog.open) return;

    const body = this.win.document.body;
    if (!body) return;
    body.append(this.dialog);
    this.dialog.showModal();
  }

  private addPasswordField(label: string): HTMLInputElement {
    const field = this.form.createEl("label", { text: label });
    return field.createEl("input", {
      attr: { type: "password", required: "", maxlength: "512", spellcheck: "false" },
    });
  }

  private async checkPassword(): Promise<void> {
    if (!this.shouldShow || this.button.disabled) return;
    const generation = this.formGeneration;
    const password = this.password.value;
    const confirmation = this.confirmation.value;
    this.form.reset();
    this.status.textContent = "";
    this.button.disabled = true;
    const error = await this.onSubmit(password, confirmation);
    if (this.formGeneration !== generation) return;
    this.button.disabled = false;
    this.status.textContent = error ?? "";
    this.password.focus();
  }
}
