import { contextBridge, ipcRenderer } from 'electron';

/**
 * Every IPC channel the renderer is allowed to invoke. This bridge is the
 * only thing standing between the (sandboxed, no-node-integration) renderer
 * and privileged main-process code — a compromised renderer (XSS, a
 * malicious dependency) could otherwise call `ipcRenderer.invoke` with any
 * channel string. Keeping this list explicit means adding a new privileged
 * handler in electron/main.ts requires a deliberate opt-in here too.
 */
const ALLOWED_CHANNELS = new Set([
  'get-csv-data',
  'get-owners',
  'import-file',
  'delete-import',
  'get-import-history',
  'save-category',
  'full-backup',
  'restore-backup',
  'reset-app',
  'get-backup-info',
  'bulk-save-metadata',
  'get-metadata',
  'save-metadata',
  'get-settings',
  'select-directory',
  'select-zip-file',
  'set-export-path',
  'get-raw-csv-folder-path',
  'set-raw-csv-folder-path',
  'scan-folder',
]);

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: any[]) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Blocked IPC call to unknown channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
});
