import 'dotenv/config';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { app } from './app';

config({ path: fileURLToPath(new URL('../.env.openclaw', import.meta.url)), quiet: true });

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
app.listen(port, '127.0.0.1', () => {
  console.log(`Scout is running at http://127.0.0.1:${port}`);
});
