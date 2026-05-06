import { deleteSettings } from './utils.js';
import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Resetting application settings...');
  deleteSettings();
  console.log('Settings reset successful.');
}
