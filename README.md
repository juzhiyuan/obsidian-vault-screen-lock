# Vault Screen Lock

Lock an Obsidian vault's workspace with a local password when Obsidian goes into the background. On desktop the lock covers the main window and pop-out windows. Switching between desktop windows also locks the workspace. On mobile the lock responds when Obsidian's web view becomes hidden. Returning to a locked workspace or reopening the vault requires the password.

Vault Screen Lock requires Obsidian 1.15.0 or later. The lock has been tested on Linux. iOS, Android, Windows, and macOS still need native verification.

## Install and use

1. Create a `vault-screen-lock` folder under the vault configuration folder's `plugins` directory. The default location is `.obsidian/plugins/vault-screen-lock/`.
2. Download `main.js`, `manifest.json`, and `styles.css` from the same GitHub release and place them directly in that folder.
3. Restart Obsidian and enable **Vault Screen Lock** under **Settings → Community plugins**.
4. Return to the workspace, then enter and confirm a password on the setup screen. Switch away from Obsidian and return to test the lock.

## Privacy and limits

The plugin runs offline. It stores a salted password verifier in Obsidian's vault-specific device storage. Set a password on each device. Obsidian writes the plugin files and enablement settings into the configuration folder during installation.

This is a privacy screen for casual access. Notes and attachments remain readable on disk. Anyone who can open Obsidian's Settings can disable the plugin, including from a separate Settings window that was left open. Close Settings before stepping away. Restricted Mode also lets you open the vault with community plugins disabled. Operating-system previews and access to vault files remain under the control of the operating system.

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
