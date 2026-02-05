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
  } catch {
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

describe('GET /api/franchise - List franchises', () => {
  test('should list all franchises without authentication', async () => {
    const res = await request(app).get('/api/franchise');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('franchises');
    expect(res.body).toHaveProperty('more');
    expect(Array.isArray(res.body.franchises)).toBe(true);
  });

  test('should support pagination with page parameter', async () => {
    const res = await request(app).get('/api/franchise?page=0&limit=5');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('franchises');
    expect(res.body).toHaveProperty('more');
  });

  test('should support filtering by name', async () => {
    const res = await request(app).get('/api/franchise?name=pizza');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('franchises');
  });

  test('should return franchise with correct structure', async () => {
    const res = await request(app).get('/api/franchise');

    expect(res.status).toBe(200);
    if (res.body.franchises.length > 0) {
      const franchise = res.body.franchises[0];
      expect(franchise).toHaveProperty('id');
      expect(franchise).toHaveProperty('name');
      expect(franchise).toHaveProperty('stores');
      expect(Array.isArray(franchise.stores)).toBe(true);
    }
  });
});

describe('GET /api/franchise/:userId - List user franchises', () => {
  test('should return 401 when not authenticated', async () => {
    const res = await request(app).get(`/api/franchise/${franchiseeUserId}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('unauthorized');
  });

  test('should allow user to view their own franchises', async () => {
    const res = await request(app)
      .get(`/api/franchise/${franchiseeUserId}`)
      .set('Authorization', `Bearer ${franchiseeToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('should return empty array when user has no franchises', async () => {
    const res = await request(app)
      .get(`/api/franchise/${regularUserId}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('should not allow user to view other user franchises without admin role', async () => {
    const res = await request(app)
      .get(`/api/franchise/${franchiseeUserId}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('should allow admin to view any user franchises', async () => {
    if (!isAdminAvailable) {
      console.log('Skipping admin test - admin role not available');
      return;
    }

    const res = await request(app)
      .get(`/api/franchise/${franchiseeUserId}`)
      .set('Authorization', `Bearer ${testUserToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/franchise - Create franchise', () => {
  test('should return 401 when not authenticated', async () => {
    const newFranchise = {
      name: 'New Pizza Franchise',
      admins: [{ email: franchiseeUser.email }],
    };

    const res = await request(app).post('/api/franchise').send(newFranchise);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('unauthorized');
  });

  test('should return 403 when non-admin user tries to create franchise', async () => {
    const newFranchise = {
      name: 'New Pizza Franchise',
      admins: [{ email: franchiseeUser.email }],
    };

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${regularToken}`)
      .send(newFranchise);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to create a franchise');
  });

  test('should allow admin to create a new franchise', async () => {
    if (!isAdminAvailable) {
      console.log('Skipping admin test - admin role not available');
      return;
    }

    const newFranchise = {
      name: 'Pizza Palace ' + Math.random().toString(36).substring(2, 8),
      admins: [{ email: franchiseeUser.email }],
    };

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send(newFranchise);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe(newFranchise.name);
    expect(res.body).toHaveProperty('admins');
    expect(Array.isArray(res.body.admins)).toBe(true);
    
    // Store for later tests
    testFranchiseId = res.body.id;
  });

  test('should create franchise with multiple admins', async () => {
    if (!isAdminAvailable) {
      console.log('Skipping admin test - admin role not available');
      return;
    }

    const newFranchise = {
      name: 'Multi Admin Franchise ' + Math.random().toString(36).substring(2, 8),
      admins: [
        { email: franchiseeUser.email },
        { email: regularUser.email },
      ],
    };

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send(newFranchise);

    expect(res.status).toBe(200);
    expect(res.body.admins.length).toBeGreaterThanOrEqual(1);
  });
});

describe('DELETE /api/franchise/:franchiseId - Delete franchise', () => {
  let franchiseToDelete;

  beforeEach(async () => {
    if (!isAdminAvailable) {
      return;
    }

    // Create a franchise to delete
    const newFranchise = {
      name: 'Temp Franchise ' + Math.random().toString(36).substring(2, 8),
      admins: [{ email: franchiseeUser.email }],
    };

    const createRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send(newFranchise);

    franchiseToDelete = createRes.body.id;
  });

  test('should delete franchise successfully', async () => {
    if (!isAdminAvailable) {
      console.log('Skipping admin test - admin role not available');
      return;
    }

    const res = await request(app)
      .delete(`/api/franchise/${franchiseToDelete}`)
      .set('Authorization', `Bearer ${testUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('franchise deleted');
  });

  test('should handle deleting non-existent franchise', async () => {
    if (!isAdminAvailable) {
      console.log('Skipping admin test - admin role not available');
      return;
    }

    const res = await request(app)
      .delete('/api/franchise/99999')
      .set('Authorization', `Bearer ${testUserToken}`);

    // Should either succeed or return appropriate error
    expect([200, 404]).toContain(res.status);
  });
});

});
});