import { Component, Notice, Platform, Plugin, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import { createVerifier, isPasswordVerifier, PasswordVerifier, verifyPassword } from "./password";

const storageKey = "vault-screen-lock:verifier";
const defaultMobileGraceSeconds = 15;

function isGraceSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

interface ScreenLockDetector extends EventTarget {
  readonly screenState: "locked" | "unlocked" | null;
  start(options: { signal: AbortSignal }): Promise<void>;
}

interface ScreenLockDetectorConstructor {
  new (): ScreenLockDetector;
  requestPermission(): Promise<PermissionState>;
}

export default class VaultScreenLock extends Plugin {
  private readonly screens = new Map<Window, LockScreen>();
  private verifier: PasswordVerifier | null | undefined;
  private locked = true;
  private lockGeneration = 0;
  private disposed = false;
  private pendingDesktopWarning: string | undefined;
  private mobileBackgroundedAt: { wallTime: number; monotonicTime: number } | undefined;
  // Until the stored preference is known, lock immediately on background.
  private mobileGraceSeconds = 0;

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

    this.addCommand({
      id: "lock-now",
      name: "Lock now",
      callback: () => this.lock(),
    });
    if (Platform.isDesktopApp) {
      this.watchSystemScreenLock();
    } else if (Platform.isMobileApp) {
      this.watchMobileBackground(window);
      void this.loadMobileSettings();
    }
  }

  onunload(): void {
    this.disposed = true;
    this.screens.clear();
  }

  private watchWindow(win: Window): void {
    if (this.screens.has(win)) return;

    const screen = new LockScreen(win, (password, confirmation) =>
      this.submit(password, confirmation));
    this.screens.set(win, screen);
    this.addChild(screen);
    if (this.locked) screen.show(this.verifier);
    else if (this.mobileBackgroundedAt !== undefined) screen.cover();
  }

  private watchSystemScreenLock(): void {
    const { IdleDetector } = window as Window & { IdleDetector?: ScreenLockDetectorConstructor };
    if (!IdleDetector) {
      this.warnAboutDesktopDetection("System screen lock detection is unavailable. You can still use Lock now.");
      return;
    }

    const controller = new AbortController();
    this.register(() => controller.abort());
    let starting = false;
    let started = false;
    const start = async (requestPermission: boolean) => {
      starting = true;
      try {
        if (requestPermission && await IdleDetector.requestPermission() !== "granted") {
          throw new Error("Permission denied");
        }
        if (controller.signal.aborted) return;

        const detector = new IdleDetector();
        await detector.start({ signal: controller.signal });
        if (controller.signal.aborted) return;
        started = true;
        this.pendingDesktopWarning = undefined;
        if (requestPermission) new Notice("System screen lock detection is active.");

        let wasLocked = false;
        const update = () => {
          const locked = detector.screenState === "locked";
          if (locked && !wasLocked) this.lock();
          wasLocked = locked;
        };
        detector.addEventListener("change", update, { signal: controller.signal });
        update();
      } catch {
        if (!controller.signal.aborted) {
          this.warnAboutDesktopDetection(requestPermission
            ? "Could not enable system screen lock detection. You can still use Lock now."
            : "System screen lock detection is inactive. Run Enable system screen lock detection to try again.");
        }
      } finally {
        starting = false;
      }
    };

    this.addCommand({
      id: "enable-system-screen-lock-detection",
      name: "Enable system screen lock detection",
      checkCallback: (checking) => {
        if (starting || started) return false;
        if (!checking) void start(true);
        return true;
      },
    });
    void start(false);
  }

  private warnAboutDesktopDetection(message: string): void {
    // Obsidian notices are behind the lock dialog until the vault is unlocked.
    if (this.locked) this.pendingDesktopWarning = message;
    else new Notice(message, 10_000);
  }

  private watchMobileBackground(win: Window): void {
    const doc = win.document;
    const background = () => {
      if (this.mobileBackgroundedAt !== undefined) return;
      this.mobileBackgroundedAt = { wallTime: Date.now(), monotonicTime: win.performance.now() };
      if (this.locked || this.mobileGraceSeconds === 0) {
        this.lock();
        return;
      }
      for (const screen of this.screens.values()) screen.cover();
    };
    const foreground = () => {
      if (doc.hidden || this.mobileBackgroundedAt === undefined) return;
      const wallElapsed = Date.now() - this.mobileBackgroundedAt.wallTime;
      const monotonicElapsed = win.performance.now() - this.mobileBackgroundedAt.monotonicTime;
      this.mobileBackgroundedAt = undefined;
      if (this.locked) return;
      if (wallElapsed < 0 || Math.max(wallElapsed, monotonicElapsed) >= this.mobileGraceSeconds * 1000) this.lock();
      else for (const screen of this.screens.values()) screen.hide();
    };
    this.registerDomEvent(doc, "visibilitychange", () => {
      if (doc.hidden) background();
      else foreground();
    });
    this.registerDomEvent(win, "pagehide", background);
    this.registerDomEvent(win, "pageshow", foreground);
    this.registerDomEvent(win, "focus", foreground);
    this.registerDomEvent(doc, "pointerdown", foreground, { capture: true });
    if (doc.hidden) background();
  }

  private async loadMobileSettings(): Promise<void> {
    let seconds = defaultMobileGraceSeconds;
    try {
      const data: unknown = await this.loadData();
      if (typeof data === "object" && data !== null &&
          "mobileGraceSeconds" in data && isGraceSeconds(data.mobileGraceSeconds)) {
        seconds = data.mobileGraceSeconds;
      }
    } catch {
      // Use the default if the plugin settings are unavailable.
    }
    if (this.disposed) return;
    this.mobileGraceSeconds = seconds;

    this.addSettingTab(new MobileLockSettings(this, () => this.mobileGraceSeconds, async (seconds) => {
      if (this.disposed || this.mobileGraceSeconds === seconds) return;
      await this.saveData({ mobileGraceSeconds: seconds });
      this.mobileGraceSeconds = seconds;
    }));
  }

  private lock(): void {
    // Invalidate a password check that started before this lock.
    this.lockGeneration++;
    this.locked = true;
    for (const screen of this.screens.values()) screen.show(this.verifier);
  }

  private async submit(password: string, confirmation: string): Promise<string | undefined> {
    if (!this.locked || this.verifier === undefined) return;
    if (this.mobileBackgroundedAt !== undefined && window.document.hidden) return;

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
      this.mobileBackgroundedAt = undefined;
      for (const screen of this.screens.values()) screen.hide();
      if (this.pendingDesktopWarning) {
        new Notice(this.pendingDesktopWarning, 10_000);
        this.pendingDesktopWarning = undefined;
      }
    } catch {
      if (generation === this.lockGeneration) {
        return "Could not check or save the password on this device.";
      }
    }
  }
}

class MobileLockSettings extends PluginSettingTab {
  private saving = Promise.resolve();

  constructor(
    plugin: VaultScreenLock,
    private readonly getSeconds: () => number,
    private readonly save: (seconds: number) => Promise<void>,
  ) {
    super(plugin.app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [{
      name: "Background grace period",
      desc: "Seconds you can spend away from Obsidian before it locks. Enter 0 to lock immediately.",
      control: {
        type: "number",
        key: "mobileGraceSeconds",
        defaultValue: defaultMobileGraceSeconds,
        min: 0,
        step: 1,
        validate: (seconds) => isGraceSeconds(seconds) ? undefined : "Enter a whole number of seconds, zero or greater.",
      },
    }];
  }

  getControlValue(): number {
    return this.getSeconds();
  }

  setControlValue(_key: string, value: unknown): Promise<void> | void {
    if (!isGraceSeconds(value)) return;
    this.saving = this.saving.then(() => this.save(value)).catch(() => {
      new Notice("Could not save the grace period.");
    });
    return this.saving;
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
    private readonly onSubmit: (password: string, confirmation: string) => Promise<string | undefined>,
  ) {
    super();
    const doc = win.document;
    this.dialog = doc.createElement("dialog");
    this.dialog.className = "vault-screen-lock";
    this.form = this.dialog.createEl("form", { cls: "vault-screen-lock-form" });
    this.heading = this.form.createEl("h1", { attr: { id: "vault-screen-lock-title" } });
    this.password = this.addPasswordField("Password");
    this.confirmation = this.addPasswordField("Confirm password");
    this.button = this.form.createEl("button", { attr: { type: "submit" } });
    this.status = this.form.createEl("p", { attr: { role: "status" } });
  }

  onload(): void {
    const doc = this.win.document;

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
    this.form.hidden = false;
    this.dialog.removeAttribute("aria-label");
    this.dialog.setAttribute("aria-labelledby", this.heading.id);
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

  cover(): void {
    this.shouldShow = true;
    this.form.hidden = true;
    this.dialog.removeAttribute("aria-labelledby");
    this.dialog.setAttribute("aria-label", "Vault hidden");
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
    if (!this.shouldShow || this.form.hidden || this.button.disabled) return;
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
