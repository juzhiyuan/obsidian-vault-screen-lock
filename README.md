# Vault Screen Lock

Lock an Obsidian vault's workspace with a local password when Obsidian loses focus. The lock covers the main window and pop-out windows. Switching between those windows also locks the workspace. Returning to Obsidian or reopening the vault requires the password.

Vault Screen Lock requires Obsidian 1.15.0 or later on desktop. The behavior was verified on Linux.

## Install and use

1. Create a `vault-screen-lock` folder under the vault configuration folder's `plugins` directory. The default location is `.obsidian/plugins/vault-screen-lock/`.
2. Download `main.js`, `manifest.json`, and `styles.css` from the same GitHub release and place them directly in that folder.
3. Restart Obsidian and enable **Vault Screen Lock** under **Settings → Community plugins**.
4. Return to the workspace, then enter and confirm a password on the setup screen. Switch away from Obsidian and return to test the lock.

## Privacy and limits

The plugin runs offline. It stores a salted password verifier in Obsidian's vault-specific device storage. Set a password on each device. Obsidian writes the plugin files and enablement settings into the configuration folder during installation.

This is a privacy screen for casual access. Notes and attachments remain readable on disk, and Restricted Mode lets you open the vault with community plugins disabled. Operating-system previews and access to vault files remain under the control of the operating system.

## Build

Build with Node.js 24 and npm.

```sh
npm ci --ignore-scripts
npm run lint
npm run build
```

Attach `main.js`, `manifest.json`, and `styles.css` individually to a GitHub Release whose tag equals the manifest version.

## License

[MIT](LICENSE)
