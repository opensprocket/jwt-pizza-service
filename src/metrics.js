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

// Metric serialization

/**
 * Build a single OTel metric object.
 * metricType: 'sum' | 'gauge'
 * valueType:  'asInt' | 'asDouble'
 */
function buildMetric(name, value, unit, metricType, valueType, attributes = {}) {
  const attrs = { source: config.metrics?.source ?? 'unknown', ...attributes };

  const dataPoint = {
    [valueType]: value,
    timeUnixNano: Date.now() * 1_000_000,
    attributes: Object.entries(attrs).map(([key, val]) => ({
      key,
      value: { stringValue: String(val) },
    })),
  };

  const metric = {
    name,
    unit,
    [metricType]: { dataPoints: [dataPoint] },
  };

  if (metricType === 'sum') {
    metric.sum.aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric.sum.isMonotonic = true;
  }

  return metric;
}

function collectMetrics() {
  const avgServiceLatency =
    latencyMetrics.serviceCount > 0
      ? latencyMetrics.serviceTotal / latencyMetrics.serviceCount
      : 0;

  const avgPizzaLatency =
    latencyMetrics.pizzaCount > 0
      ? latencyMetrics.pizzaTotal / latencyMetrics.pizzaCount
      : 0;

  return [
    // HTTP request counts
    buildMetric('http_requests_total',  httpMetrics.total,  '1', 'sum', 'asInt'),
    buildMetric('http_requests_get',    httpMetrics.GET,    '1', 'sum', 'asInt', { method: 'GET' }),
    buildMetric('http_requests_post',   httpMetrics.POST,   '1', 'sum', 'asInt', { method: 'POST' }),
    buildMetric('http_requests_put',    httpMetrics.PUT,    '1', 'sum', 'asInt', { method: 'PUT' }),
    buildMetric('http_requests_delete', httpMetrics.DELETE, '1', 'sum', 'asInt', { method: 'DELETE' }),

    // Active users (gauge — point-in-time value)
    buildMetric('active_users', activeUsers, '1', 'gauge', 'asInt'),

    // Auth attempts
    buildMetric('auth_attempts_success', authMetrics.success, '1', 'sum', 'asInt', { result: 'success' }),
    buildMetric('auth_attempts_failure', authMetrics.failure, '1', 'sum', 'asInt', { result: 'failure' }),

    // System
    buildMetric('system_cpu_percent',    getCpuUsagePercentage(),    '%', 'gauge', 'asDouble'),
    buildMetric('system_memory_percent', getMemoryUsagePercentage(), '%', 'gauge', 'asDouble'),

    // Pizza purchases
    buildMetric('pizza_sold',     pizzaMetrics.sold,     '1',  'sum', 'asInt'),
    buildMetric('pizza_failures', pizzaMetrics.failures, '1',  'sum', 'asInt'),
    buildMetric('pizza_revenue',  pizzaMetrics.revenue,  'USD','sum', 'asDouble'),

    // Latency (averages over the interval)
    buildMetric('latency_service_ms', avgServiceLatency, 'ms', 'gauge', 'asDouble'),
    buildMetric('latency_pizza_ms',   avgPizzaLatency,   'ms', 'gauge', 'asDouble'),
  ];
}

// Reset per-interval counters after each send. Gauges (activeUsers, system) are not reset.
function resetIntervalCounters() {
  httpMetrics.total = httpMetrics.GET = httpMetrics.POST = httpMetrics.PUT = httpMetrics.DELETE = 0;
  authMetrics.success = authMetrics.failure = 0;
  pizzaMetrics.sold = pizzaMetrics.failures = pizzaMetrics.revenue = 0;
  latencyMetrics.serviceTotal = latencyMetrics.serviceCount = 0;
  latencyMetrics.pizzaTotal   = latencyMetrics.pizzaCount   = 0;
}

