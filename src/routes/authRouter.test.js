const request = require('supertest');
const app = require('../service.js');
const { DB } = require('../database/database.js');
const jwt = require('jsonwebtoken');
const config = require('../config.js');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserId;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserId = registerRes.body.user.id;
});

describe('POST /api/auth - Register', () => {
  test('should register a new user successfully', async () => {
    const newUser = {
      name: 'test user',
      email: Math.random().toString(36).substring(2, 12) + '@test.com',
      password: 'password123',
    };

    const res = await request(app).post('/api/auth').send(newUser);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.name).toBe(newUser.name);
    expect(res.body.user.email).toBe(newUser.email);
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.roles).toEqual([{ role: 'diner' }]);
    expect(res.body.user.id).toBeDefined();
  });

  test('should return 400 when name is missing', async () => {
    const invalidUser = {
      email: 'test@test.com',
      password: 'password123',
    };

    const res = await request(app).post('/api/auth').send(invalidUser);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('name, email, and password are required');
  });

  test('should return 400 when email is missing', async () => {
    const invalidUser = {
      name: 'Test User',
      password: 'password123',
    };

    const res = await request(app).post('/api/auth').send(invalidUser);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('name, email, and password are required');
  });

  test('should return 400 when password is missing', async () => {
    const invalidUser = {
      name: 'Test User',
      email: 'test@test.com',
    };

    const res = await request(app).post('/api/auth').send(invalidUser);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('name, email, and password are required');
  });

  test('should return 400 when all fields are missing', async () => {
    const res = await request(app).post('/api/auth').send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('name, email, and password are required');
  });
});

describe('PUT /api/auth - Login', () => {
  test('should login existing user successfully', async () => {
    const loginRes = await request(app).put('/api/auth').send({
      email: testUser.email,
      password: testUser.password,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
    expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

    expect(loginRes.body.user).toMatchObject({
      name: testUser.name,
      email: testUser.email,
      roles: [{ role: 'diner' }],
    });
    expect(loginRes.body.user.password).toBeUndefined();
  });

  test('should verify JWT token contains correct user data', async () => {
    const loginRes = await request(app).put('/api/auth').send({
      email: testUser.email,
      password: testUser.password,
    });

    const decoded = jwt.verify(loginRes.body.token, config.jwtSecret);
    expect(decoded.id).toBe(testUserId);
    expect(decoded.name).toBe(testUser.name);
    expect(decoded.email).toBe(testUser.email);
    expect(decoded.roles).toEqual([{ role: 'diner' }]);
  });

  test('should handle invalid credentials', async () => {
    const loginRes = await request(app).put('/api/auth').send({
      email: testUser.email,
      password: 'wrongpassword',
    });

    expect(loginRes.status).toBeGreaterThanOrEqual(400);
  });

  test('should handle non-existent user', async () => {
    const loginRes = await request(app).put('/api/auth').send({
      email: 'nonexistent@test.com',
      password: 'password',
    });

    expect(loginRes.status).toBeGreaterThanOrEqual(400);
  });
});

describe('DELETE /api/auth - Logout', () => {
  test('should logout authenticated user successfully', async () => {
    const loginRes = await request(app).put('/api/auth').send({
      email: testUser.email,
      password: testUser.password,
    });
    const token = loginRes.body.token;

    const logoutRes = await request(app)
      .delete('/api/auth')
      .set('Authorization', `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe('logout successful');
  });

  test('should return 401 when no token is provided', async () => {
    const logoutRes = await request(app).delete('/api/auth');

    expect(logoutRes.status).toBe(401);
    expect(logoutRes.body.message).toBe('unauthorized');
  });

  test('should return 401 when invalid token is provided', async () => {
    const logoutRes = await request(app)
      .delete('/api/auth')
      .set('Authorization', 'Bearer invalidtoken123');

    expect(logoutRes.status).toBe(401);
    expect(logoutRes.body.message).toBe('unauthorized');
  });

  test('should return 401 when malformed authorization header', async () => {
    const logoutRes = await request(app)
      .delete('/api/auth')
      .set('Authorization', 'InvalidFormat');

    expect(logoutRes.status).toBe(401);
    expect(logoutRes.body.message).toBe('unauthorized');
  });

  test('should verify token is invalidated after logout', async () => {
    const loginRes = await request(app).put('/api/auth').send({
      email: testUser.email,
      password: testUser.password,
    });
    const token = loginRes.body.token;

    await request(app)
      .delete('/api/auth')
      .set('Authorization', `Bearer ${token}`);

    const isLoggedIn = await DB.isLoggedIn(token);
    expect(isLoggedIn).toBe(false);
  });
});

describe('Authentication Middleware', () => {
  test('should allow access to protected routes with valid token', async () => {
    const loginRes = await request(app).put('/api/auth').send({
      email: testUser.email,
      password: testUser.password,
    });

    const protectedRes = await request(app)
      .delete('/api/auth')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(protectedRes.status).toBe(200);
  });

  test('should reject access to protected routes without token', async () => {
    const protectedRes = await request(app).delete('/api/auth');

    expect(protectedRes.status).toBe(401);
  });

  test('should handle expired or logged out tokens', async () => {
    const loginRes = await request(app).put('/api/auth').send({
      email: testUser.email,
      password: testUser.password,
    });
    const token = loginRes.body.token;

    await request(app)
      .delete('/api/auth')
      .set('Authorization', `Bearer ${token}`);

    const retryRes = await request(app)
      .delete('/api/auth')
      .set('Authorization', `Bearer ${token}`);

    expect(retryRes.status).toBe(401);
  });
});

describe('Edge Cases', () => {
  test('should handle empty string values', async () => {
    const res = await request(app).post('/api/auth').send({
      name: '',
      email: '',
      password: '',
    });

    expect(res.status).toBe(400);
  });

});