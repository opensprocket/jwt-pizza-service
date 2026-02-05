const request = require('supertest');
const app = require('../service');
const { DB, Role } = require('../database/database.js');

// Test users
const testDiner = { name: 'Test Diner', email: 'diner@test.com', password: 'diner123' };
const testAdmin = { name: 'Test Admin', email: 'admin@test.com', password: 'admin123' };

let dinerToken;
let dinerUser;
let adminToken;
let adminUser;

// Helper to add admin role to a user
async function addAdminRole(userId) {
  try {
    const connection = await DB.getConnection();
    try {
      await connection.query('INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)', [userId, Role.Admin, 0]);
      return true;
    } finally {
      connection.end();
    }
  } catch (err) {
    console.log("Error message:");
    console.log(err);
    return false;
  }
}

beforeAll(async () => {
  // Create Diner User
  testDiner.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const dinerRes = await request(app).post('/api/auth').send(testDiner);
  dinerToken = dinerRes.body.token;
  dinerUser = dinerRes.body.user;

  // Create Admin User
  testAdmin.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const adminRes = await request(app).post('/api/auth').send(testAdmin);
  adminUser = adminRes.body.user;
  adminToken = adminRes.body.token;

  // Grant Admin Role
  const adminAdded = await addAdminRole(adminUser.id);
  if (adminAdded) {
    // Re-login to update token claims
    const loginRes = await request(app).put('/api/auth').send(testAdmin);
    adminToken = loginRes.body.token;
  }
});

afterAll(async () => {
  if (DB.connection) {
    await DB.connection.end();
  }
});

// Mock the global fetch for the factory service
global.fetch = jest.fn();

describe('GET /api/order/menu - Get menu', () => {
  test('should return the menu items without authentication', async () => {
    const res = await request(app).get('/api/order/menu');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    
    // Verify structure if menu is not empty
    if (res.body.length > 0) {
      const item = res.body[0];
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('image');
      expect(item).toHaveProperty('price');
      expect(item).toHaveProperty('description');
    }
  });
});

