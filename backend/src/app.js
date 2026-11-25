import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import workerRoutes from './routes/workerRoutes.js';
import billRoutes from './routes/billRoutes.js';
import pointRoutes from './routes/pointRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { prisma } from './models/prisma.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean),
  credentials: config.corsOrigin !== '*',
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
});

const authLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many auth requests, please try again later.' } },
});

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, status: 'ok', service: 'haritha-karma-sena-backend', db: 'connected', timestamp: new Date().toISOString() });
  } catch (_err) {
    res.status(503).json({ success: false, status: 'degraded', service: 'haritha-karma-sena-backend', db: 'disconnected' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/points', pointRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
