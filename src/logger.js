const config = require('./config.js');

class Logger {
  static LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

  // Recursively scrub sensitive keys from any object before it is logged.
  sanitize(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const SENSITIVE_KEYS = /^(password|token|apiKey|api_key|secret|authorization|credit_card|creditCard|cvv|ssn)$/i;
    const REDACTED = '[REDACTED]';

    const clean = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.test(k)) {
        clean[k] = REDACTED;
      } else if (v && typeof v === 'object') {
        clean[k] = this.sanitize(v);
      } else if (typeof v === 'string' && this._looksLikeJwt(v)) {
        clean[k] = REDACTED;
      } else {
        clean[k] = v;
      }
    }
    return clean;
  }

  _looksLikeJwt(str) {

    return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(str);
  }

  _safeStringify(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(this.sanitize(value));
    } catch {
      return String(value);
    }
  }


  sendLogToGrafana(level, type, message, data) {
    // Never fire real HTTP during Jest runs — prevents the logger's fetch from
    // interfering with mocked fetch calls in tests (e.g. the factory mock).
    if (process.env.NODE_ENV === 'test') return;

    const logConfig = config.logging;
    if (!logConfig?.endpointUrl || !logConfig?.accountId || !logConfig?.apiKey) return;

    const logLine = JSON.stringify({
      message,
      ...(data !== undefined ? { data: this.sanitize(data) } : {}),
    });

    const body = JSON.stringify({
      streams: [
        {
          stream: {
            source: logConfig.source || 'jwt-pizza-service',
            level,
            type,
          },
          values: [[`${Date.now() * 1_000_000}`, logLine]],
        },
      ],
    });

    fetch(logConfig.endpointUrl, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${logConfig.accountId}:${logConfig.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) {
        res.text().then((t) => console.error('Failed to send log to Grafana:', res.status, t));
      }
    }).catch((err) => {
      console.error('Logger fetch error:', err.message);
    });
  }

  // level: 'debug' | 'info' | 'warn' | 'error'
  // type:  'http' | 'db' | 'factory' | 'exception' | 'app'
  log(level, type, message, data) {
    // Always mirror to stdout for local dev visibility
    const output = { level, type, message, ...(data !== undefined ? { data: this.sanitize(data) } : {}) };
    console.log(JSON.stringify(output));

    this.sendLogToGrafana(level, type, message, data);
  }

  // Attach to app early (after express.json()) so every request is captured.
  get httpLogger() {
    return (req, res, next) => {
      // Capture body now; at response time it may be gone
      const reqBody = req.body && Object.keys(req.body).length ? this.sanitize(req.body) : undefined;
      const hasAuth = !!req.headers.authorization;

      // Intercept res.json / res.send to capture response body
      let resBody;
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      const captureBody = (body) => {
        try {
          resBody = typeof body === 'string' ? JSON.parse(body) : body;
        } catch {
          resBody = body;
        }
      };

      res.json = (body) => { captureBody(body); return originalJson(body); };
      res.send = (body) => { captureBody(body); return originalSend(body); };

      res.on('finish', () => {
        const logData = {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          hasAuth,
          ...(reqBody !== undefined ? { reqBody } : {}),
          ...(resBody !== undefined ? { resBody: this.sanitize(resBody) } : {}),
        };

        const level = res.statusCode >= 500 ? 'error'
                    : res.statusCode >= 400 ? 'warn'
                    : 'info';

        this.log(level, 'http', `${req.method} ${req.path} ${res.statusCode}`, logData);
      });

      next();
    };
  }

  get exceptionLogger() {
    // eslint-disable-next-line no-unused-vars
    return (err, req, res, next) => {
      this.log('error', 'exception', err.message || 'Unhandled exception', {
        name: err.name,
        stack: err.stack,
        path: req?.path,
        method: req?.method,
      });
      next(err); // Pass to the existing error handler in service.js
    };
  }

  dbLog(sql, params) {
    // Strip parameter values — log statement shape only, not user data
    this.log('info', 'db', 'DB query', { sql, params: params ? '[params omitted]' : undefined });
  }

  factoryLog(direction, body) {
    // direction: 'request' | 'response'
    this.log('info', 'factory', `Factory ${direction}`, this.sanitize(body));
  }
}

const logger = new Logger();
module.exports = logger;