const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database.js');

// Test users with different roles
const testUser = { name: 'Test User', email: 'test@test.com', password: 'test123' };
const franchiseeUser = { name: 'Franchisee User', email: 'franchisee@test.com', password: 'franchisee123' };
const regularUser = { name: 'Regular User', email: 'regular@test.com', password: 'regular123' };

let testUserToken;
let testUserId;
let franchiseeToken;
let franchiseeUserId;
let regularToken;
let regularUserId;
let testFranchiseId;
let isAdminAvailable = false;

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
  } catch (error) {
    return false;
  }
}

beforeAll(async () => {
  // Create test user and try to make them admin
  testUser.email = 'test-' + Math.random().toString(36).substring(2, 12) + '@test.com';
  const testRes = await request(app).post('/api/auth').send(testUser);
  testUserToken = testRes.body.token;
  testUserId = testRes.body.user.id;
  
  // Try to add admin role
  const adminAdded = await addAdminRole(testUserId);
  
  if (adminAdded) {
    // Re-login to get token with admin role
    const loginRes = await request(app).put('/api/auth').send({
      email: testUser.email,
      password: testUser.password
    });
    testUserToken = loginRes.body.token;
    isAdminAvailable = true;
  }

  // Create franchisee user
  franchiseeUser.email = 'franchisee-' + Math.random().toString(36).substring(2, 12) + '@test.com';
  const franchiseeRes = await request(app).post('/api/auth').send(franchiseeUser);
  franchiseeToken = franchiseeRes.body.token;
  franchiseeUserId = franchiseeRes.body.user.id;

  // Create regular user
  regularUser.email = 'regular-' + Math.random().toString(36).substring(2, 12) + '@test.com';
  const regularRes = await request(app).post('/api/auth').send(regularUser);
  regularToken = regularRes.body.token;
  regularUserId = regularRes.body.user.id;
});

afterAll(async () => {
  // Close any open database connections
  if (DB.connection) {
    await DB.connection.end();
  }
});

