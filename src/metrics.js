const os = require('os');
const config = require('./config.js');

const metricsEnabled = !!(config.metrics && config.metrics.endpointUrl);

// In-memory metric tracking

// HTTP counters — reset each interval
const httpMetrics = {
  total: 0,
  GET: 0,
  POST: 0,
  PUT: 0,
  DELETE: 0,
};

// Latency accumulators — sum and count so we can report average; reset each interval
const latencyMetrics = {
  serviceTotal: 0,   // sum of all endpoint response times (ms)
  serviceCount: 0,
  pizzaTotal: 0,     // sum of factory response times (ms)
  pizzaCount: 0,
};

// Auth counters — reset each interval
const authMetrics = {
  success: 0,
  failure: 0,
};

// Active users — gauge, never reset
let activeUsers = 0;

// Pizza purchase counters — reset each interval
const pizzaMetrics = {
  sold: 0,
  failures: 0,
  revenue: 0,
};

// Public API used by routers

/**
 * Express middleware. Mount with app.use(metrics.requestTracker) before routers.
 * Tracks per-method counts, total count, and per-request service latency.
 */
function requestTracker(req, res, next) {
  const start = Date.now();

  httpMetrics.total++;
  const method = req.method.toUpperCase();
  if (method in httpMetrics) {
    httpMetrics[method]++;
  }

  res.on('finish', () => {
    latencyMetrics.serviceTotal += Date.now() - start;
    latencyMetrics.serviceCount++;
  });

  next();
}

/**
 * Call after every login attempt.
 * @param {boolean} success
 */
function authAttempt(success) {
  if (success) {
    authMetrics.success++;
  } else {
    authMetrics.failure++;
  }
}

/** Call after a successful login (register counts too — user is now active). */
function userLogin() {
  activeUsers++;
}

/** Call after a successful logout. */
function userLogout() {
  if (activeUsers > 0) activeUsers--;
}

/**
 * Call after every pizza factory request completes (success or failure).
 * @param {boolean} success
 * @param {number}  latencyMs  - elapsed ms for the factory fetch call
 * @param {number}  revenue    - total price of the order (0 on failure)
 */
function pizzaPurchase(success, latencyMs, revenue) {
  latencyMetrics.pizzaTotal += latencyMs;
  latencyMetrics.pizzaCount++;

  if (success) {
    pizzaMetrics.sold++;
    pizzaMetrics.revenue += revenue;
  } else {
    pizzaMetrics.failures++;
  }
}

// System helpers

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return parseFloat((cpuUsage * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  const used = os.totalmem() - os.freemem();
  return parseFloat(((used / os.totalmem()) * 100).toFixed(2));
}

