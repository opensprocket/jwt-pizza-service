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

});