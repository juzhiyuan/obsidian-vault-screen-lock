# Vault Screen Lock

Lock an Obsidian vault's workspace with a local password. Reopening the vault or returning to a locked workspace requires the password.

Vault Screen Lock requires Obsidian 1.15.0 or later.

## Install and use

1. Create a `vault-screen-lock` folder under the vault configuration folder's `plugins` directory. The default location is `.obsidian/plugins/vault-screen-lock/`.
2. Download `main.js`, `manifest.json`, and `styles.css` from the same GitHub release and place them directly in that folder.
3. Restart Obsidian and enable **Vault Screen Lock** under **Settings → Community plugins**.
4. Return to the workspace, then enter and confirm a password on the setup screen. Run **Vault Screen Lock: Lock now** from the command palette to test the lock.

## Automatic locking

- **Desktop** — When Obsidian receives a system screen lock signal, the plugin locks the main window and any pop-outs. Switching apps or minimizing Obsidian keeps the vault unlocked. If Obsidian shows a notice that detection is inactive, run **Vault Screen Lock: Enable system screen lock detection** from the command palette. Availability depends on the OS and Obsidian's runtime. Some desktop environments also report an active screen saver as a screen lock. Use **Lock now** whenever detection is unavailable.
- **Mobile** — Set **Background grace period** in the plugin settings. The default is 15 seconds. Returning before the grace period ends keeps the vault unlocked if the same app session is still running. Set it to 0 to lock as soon as Obsidian goes into the background. Force quitting or relaunching after the system closes Obsidian always requires the password.

Switching apps and minimizing have been tested on Linux with X11, along with a screen lock signal from an isolated D-Bus session. Mobile background handling has been tested in Obsidian's mobile layout with simulated app lifecycle conditions. Locking on desktop devices and lifecycle behavior on iOS and Android still need device verification.

## Privacy and limits

The plugin runs offline. It stores a salted password verifier in Obsidian's vault-specific device storage. Set a password on each device. Obsidian stores the mobile grace period with the plugin data in the vault's configuration folder. Sync can carry the grace period across devices if it includes plugin settings.

This is a privacy screen for casual access. Notes and attachments remain readable on disk. Anyone who can open Obsidian's Settings can disable the plugin, including from a separate Settings window that was left open. Close Settings before stepping away. Restricted Mode also lets you open the vault with community plugins disabled. On mobile the plugin covers the workspace during the grace period when the web view delivers its background event. The operating system controls when it captures app previews.

## Recover a password

If you forget the password or the lock screen says the saved settings could not be read, reset the verifier for that vault on this device.

1. Disable Vault Screen Lock in **Settings → Community plugins**, or open the vault in Restricted Mode. If you cannot reach either option, quit Obsidian and temporarily move the `plugins/vault-screen-lock` folder out of the vault's configuration folder. Reopen the same vault.
2. In the vault workspace, open **View → Toggle Developer Tools** and select **Console**. On mobile, use the [Obsidian guide to inspecting the web view](https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development) on the device where you set the password. Run this command to clear just the plugin's password verifier for the open vault.

   ```js
   app.saveLocalStorage("vault-screen-lock:verifier", null)
   ```

3. If you moved the plugin folder, quit Obsidian, restore the folder, and reopen the vault. Enable Vault Screen Lock if needed, then return to the workspace and set a new password.

## Build

Build with Node.js 24 or later and npm.

```sh
npm ci --ignore-scripts
npm run lint
npm run build
```

Attach `main.js`, `manifest.json`, and `styles.css` individually to a GitHub Release whose tag equals the manifest version.

The build pins the public `obsidian` type package independently of the minimum app version, which reflects the runtime used to verify the plugin.

## License

[MIT](LICENSE)
