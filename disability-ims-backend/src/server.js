import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { sequelize } from './models/index.js';
import { router } from './routes.js';
import { AppError } from './services/registry.service.js';
import { verifyMailer } from './services/notify.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTION = process.env.NODE_ENV === 'production';

// A signing secret left at its placeholder means every token in the system can
// be forged by anyone who has read the source. In development that is a
// convenience; in production it is a total authentication bypass, so the
// process refuses to start rather than coming up quietly insecure.
if (PRODUCTION && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  console.error('Startup refused: JWT_SECRET must be set to a random value of at least 32 characters in production.');
  process.exit(1);
}
// Sending real notification mail to a redirect address in production would
// deliver one person's decision letter to somebody else's inbox.
if (PRODUCTION && process.env.MAIL_REDIRECT_TO) {
  console.error('Startup refused: MAIL_REDIRECT_TO is a development-only setting and must be empty in production.');
  process.exit(1);
}

// Security headers + a Content-Security-Policy that allows the built SPA
// (same-origin scripts/assets, inline styles for React style props, and the
// Inter web font). Everything else is locked to 'self'.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
// CORS. When the SPA is served from this same origin (the default deploy) no
// cross-origin request is needed at all. Where the frontend is hosted
// separately, list its origin(s) in CORS_ORIGIN — an open policy would let any
// site on the internet drive this API with a token it has managed to obtain.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);                       // curl, server-to-server, same-origin
    if (!PRODUCTION || !allowedOrigins.length) return cb(null, true); // dev, or single-origin deploy
    return allowedOrigins.includes(origin)
      ? cb(null, true)
      : cb(new AppError(403, 'Origin not allowed by CORS policy'));
  },
}));
app.use(express.json({ limit: '1mb' }));
// Total row counts for paginated lists travel in a header, so the list
// endpoints keep returning a plain array. Browsers hide non-simple response
// headers from fetch() unless they are explicitly exposed.
app.use((_req, res, next) => { res.set('Access-Control-Expose-Headers', 'X-Total-Count'); next(); });

// Brute-force protection on the login endpoint. Only FAILED attempts are
// counted: a rural district office shares one internet connection, so
// counting successful sign-ins would lock out a whole office of officers
// once twenty of them had legitimately logged in — turning a security
// control into a denial of service against the people it protects.
// Failures are what a brute-force attempt produces, and those are capped.
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.' },
}));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', router);

// Central error handler for the API. Duplicate detection returns its
// candidates so the officer can decide, rather than silently blocking.
app.use('/api', (err, _req, res, _next) => {
  const status = err instanceof AppError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error', ...(err.duplicates && { duplicates: err.duplicates }) });
});

// ── Serve the built frontend (single-service hosting) ─────────
// Point CLIENT_DIST at the frontend's dist/ folder, or leave it and the
// server looks for the sibling ../disability-ims-frontend/dist. When present,
// the API and the SPA are served from one origin (no CORS, one deploy).
const clientDist = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.resolve(__dirname, '../../disability-ims-frontend/dist');

if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log('Serving frontend from', clientDist);
} else {
  console.log('No frontend build found (run the frontend separately, or build it and set CLIENT_DIST).');
}

// Fallback error handler (non-API routes)
app.use((err, _req, res, _next) => {
  const status = err instanceof AppError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
});

const port = process.env.PORT || 4000;

(async () => {
  await sequelize.authenticate();
  if (process.env.DB_SYNC === 'true') await sequelize.sync({ alter: true }); // dev only; use migrations in production
  // Check the mail transport at startup, so a wrong app password is found
  // on deploy rather than on the first beneficiary registration. A failure
  // is reported, not fatal: the system must still run without email.
  await verifyMailer();
  app.listen(port, () => console.log(`Disability Support IMS API on :${port}`));
})().catch((e) => { console.error('Startup failed:', e); process.exit(1); });
