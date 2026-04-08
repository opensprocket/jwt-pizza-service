const express = require('express');
const { authRouter, setAuthUser } = require('./routes/authRouter.js');
const orderRouter = require('./routes/orderRouter.js');
const franchiseRouter = require('./routes/franchiseRouter.js');
const userRouter = require('./routes/userRouter.js');
const version = require('./version.json');
const config = require('./config.js');
const metrics = require('./metrics.js');
const logger = require('./logger.js');

const app = express();
app.use(express.json());

// Metrics request tracker must come before all routers so every
// inbound request is counted and timed — including auth and 404s.
app.use(metrics.requestTracker);

// HTTP logger middleware — must come after express.json() so req.body is
// populated, but before routers so every request (including 404s) is logged.
app.use(logger.httpLogger);

app.use(setAuthUser);
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

const apiRouter = express.Router();
app.use('/api', apiRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/user', userRouter);
apiRouter.use('/order', orderRouter);
apiRouter.use('/franchise', franchiseRouter);

apiRouter.use('/docs', (req, res) => {
  res.json({
    version: version.version,
    endpoints: [...authRouter.docs, ...userRouter.docs, ...orderRouter.docs, ...franchiseRouter.docs],
    config: { factory: config.factory.url, db: config.db.connection.host },
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'welcome to JWT Pizza',
    version: version.version,
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    message: 'unknown endpoint',
  });
});

// Log all unhandled errors to Loki. For order failures, also increment
// pizza_failures so the Grafana alert fires during chaos testing.
app.use((err, req, res, next) => {
  const isOrderRoute = req.path?.startsWith('/order') || req.originalUrl?.includes('/api/order');
  if (isOrderRoute) {
    metrics.pizzaPurchase(false, 0, 0);
  }
  logger.log('error', 'exception', err.message || 'Unhandled exception', {
    name: err.name,
    stack: err.stack,
    path: req?.path,
    method: req?.method,
  });
  next(err);
});

// Default error handler — sends the HTTP response.
app.use((err, req, res, next) => {
  res.status(err.statusCode ?? 500).json({ message: err.message, stack: err.stack });
  next();
});

// Start pushing metrics to Grafana every 60 seconds.
// Only start the loop when running as a real server, not during Jest test runs,
// so tests don't leave open handles that prevent the process from exiting.
if (process.env.NODE_ENV !== 'test') {
  metrics.sendMetricsPeriodically(60_000);
}

module.exports = app;