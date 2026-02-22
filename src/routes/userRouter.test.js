const request = require('supertest');
const app = require('../service.js');
const { DB } = require('../database/database.js');
const jwt = require('jsonwebtoken');
const config = require('../config.js');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a'};

test('list users unauthorized', async () => {
  const listUsersRes = await request(app).get('/api/user');
  expect(listUsersRes.status).toBe(401);
});

test('list users', async () => {
  const [user, userToken] = await registerUser(request(app));
  const listUsersRes = await request(app)
    .get('/api/user')
    .set('Authorization', 'Bearer ' + userToken);
  expect(listUsersRes.status).toBe(200);
  expect(listUsersRes.body.users).toBeDefined();
  expect(Array.isArray(listUsersRes.body.users)).toBe(true);
  expect(listUsersRes.body.more).toBeDefined();
});

test('list users with pagination', async () => {
  const [user, userToken] = await registerUser(request(app));
  const listUsersRes = await request(app)
    .get('/api/user?page=0&limit=5')
    .set('Authorization', 'Bearer ' + userToken);
  expect(listUsersRes.status).toBe(200);
  expect(Array.isArray(listUsersRes.body.users)).toBe(true);
  expect(typeof listUsersRes.body.more).toBe('boolean');
});

test('list users with name filter', async () => {
  const [user, userToken] = await registerUser(request(app));
  const uniqueName = randomName();
  await registerUserWithName(request(app), 'Test User ' + uniqueName);
  
  const listUsersRes = await request(app)
    .get(`/api/user?name=${uniqueName}`)
    .set('Authorization', 'Bearer ' + userToken);
  expect(listUsersRes.status).toBe(200);
  expect(Array.isArray(listUsersRes.body.users)).toBe(true);
  // Should find at least the user we just created with that name
  const matchingUsers = listUsersRes.body.users.filter(u => u.name.includes(uniqueName));
  expect(matchingUsers.length).toBeGreaterThan(0);
});

async function registerUser(service) {
  const testUser = {
    name: 'pizza diner',
    email: `${randomName()}@test.com`,
    password: 'a',
  };
  const registerRes = await service.post('/api/auth').send(testUser);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

async function registerUserWithName(service, name) {
  const testUser = {
    name: name,
    email: `${randomName()}@test.com`,
    password: 'a',
  };
  const registerRes = await service.post('/api/auth').send(testUser);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}