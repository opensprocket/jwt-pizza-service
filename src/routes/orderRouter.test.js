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

describe('PUT /api/order/menu - Add menu item', () => {
  const newMenuItem = {
    title: 'Spicy Delight',
    description: 'A hot pizza',
    image: 'pizza_spicy.png',
    price: 0.005,
  };

  test('should return 401 when not authenticated', async () => {
    const res = await request(app)
      .put('/api/order/menu')
      .send(newMenuItem);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('unauthorized');
  });

  test('should return 403 when non-admin tries to add menu item', async () => {
    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send(newMenuItem);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to add menu item');
  });

  test('should allow admin to add a new menu item', async () => {
    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newMenuItem);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const addedItem = res.body.find((item) => item.title === newMenuItem.title);
    expect(addedItem).toBeDefined();
    expect(addedItem.description).toBe(newMenuItem.description);
    expect(addedItem.price).toBe(newMenuItem.price);
  });
});

describe('GET /api/order - Get user orders', () => {
  test('should return 401 when not authenticated', async () => {
    const res = await request(app).get('/api/order');
    expect(res.status).toBe(401);
  });

  test('should return orders for authenticated user', async () => {
    const res = await request(app)
      .get('/api/order')
      .set('Authorization', `Bearer ${dinerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dinerId', dinerUser.id);
    expect(res.body).toHaveProperty('orders');
    expect(Array.isArray(res.body.orders)).toBe(true);
  });

  test('should support pagination', async () => {
    const res = await request(app)
      .get('/api/order?page=1')
      .set('Authorization', `Bearer ${dinerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('orders');
  });
});

describe('POST /api/order - Create order', () => {
  const orderPayload = {
    franchiseId: 1,
    storeId: 1,
    items: [{ menuId: 1, description: 'Veggie', price: 0.05 }],
  };

  beforeEach(() => {
    fetch.mockClear();
  });

  test('should return 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/order')
      .send(orderPayload);

    expect(res.status).toBe(401);
  });

  test('should create order and verify with factory successfully', async () => {
    // Mock successful factory response
    const factoryResponse = {
      jwt: 'factory_jwt_token_123',
      reportUrl: 'http://factory-report.com',
    };

    fetch.mockResolvedValue({
      ok: true,
      json: async () => factoryResponse,
    });

    const res = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send(orderPayload);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order');
    expect(res.body).toHaveProperty('jwt', factoryResponse.jwt);
    expect(res.body).toHaveProperty('followLinkToEndChaos', factoryResponse.reportUrl);

    // Verify fetch was called with correct parameters
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/order'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          authorization: expect.stringContaining('Bearer'),
        }),
      })
    );
  });

  test('should handle factory service failure gracefully', async () => {
    // Mock failed factory response
    const factoryError = {
      reportUrl: 'http://factory-error-report.com',
      message: 'Factory busy',
    };

    fetch.mockResolvedValue({
      ok: false,
      json: async () => factoryError,
    });

    const res = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send(orderPayload);

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('message', 'Failed to fulfill order at factory');
    expect(res.body).toHaveProperty('followLinkToEndChaos', factoryError.reportUrl);
  });

  test('should fail if payload is invalid (missing required fields)', async () => {
    // Assuming DB validation throws error for missing fields
    const invalidPayload = { items: [] };

    const res = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send(invalidPayload);

    // Depending on DB implementation, this might be 500 or 400
    expect(res.status).not.toBe(200);
  });
});