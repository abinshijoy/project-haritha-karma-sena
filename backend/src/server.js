import { validateEnv, config } from './config/env.js';
import app from './app.js';

try {
  validateEnv();
} catch (err) {
  console.error('[FATAL] Environment validation failed:', err.message);
  console.error('Check your backend/.env file. See backend/.env.example for required values.');
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`Haritha Karma Sena API listening on http://localhost:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
});
