const request = require('supertest');
const app = require('../service.js');


async function registerUser(service) {
  const testUser = {
    name: 'pizza diner',
    email: `${randomName()}@test.com`,
    password: 'a',
  };
  const registerRes = await service.post('/api/auth').send(testUser);
  expect(registerRes.status).toBe(200);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

async function registerUserWithName(service, name) {
  const testUser = {
    name,
    email: `${randomName()}@test.com`,
    password: 'a',
  };
  const registerRes = await service.post('/api/auth').send(testUser);
  expect(registerRes.status).toBe(200);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function registerAdminUser(service) {
  // Log in as the seeded admin
  const loginRes = await service
    .put('/api/auth')
    .send({ email: 'a@jwt.com', password: 'admin' });
  expect(loginRes.status).toBe(200);
  loginRes.body.user.password = 'admin';
  return [loginRes.body.user, loginRes.body.token];
}

describe('List user tests', () => {
  test('list users unauthorized', async () => {
    const listUsersRes = await request(app).get('/api/user');
    expect(listUsersRes.status).toBe(401);
  });

  test('list users', async () => {
    const [, userToken] = await registerUser(request(app));
    const listUsersRes = await request(app)
      .get('/api/user')
      .set('Authorization', 'Bearer ' + userToken);
    expect(listUsersRes.status).toBe(200);
    expect(listUsersRes.body.users).toBeDefined();
    expect(Array.isArray(listUsersRes.body.users)).toBe(true);
    expect(typeof listUsersRes.body.more).toBe('boolean');
    
  if (listUsersRes.body.users.length > 0) {
    const u = listUsersRes.body.users[0];
    expect(u).toHaveProperty('id');
    expect(u).toHaveProperty('name');
    expect(u).toHaveProperty('email');
  }
});

  test('list users with pagination', async () => {
    const [, userToken] = await registerUser(request(app));
    const listUsersRes = await request(app)
      .get('/api/user?page=0&limit=5')
      .set('Authorization', 'Bearer ' + userToken);
    expect(listUsersRes.status).toBe(200);
    expect(Array.isArray(listUsersRes.body.users)).toBe(true);
    expect(typeof listUsersRes.body.more).toBe('boolean');
    
    expect(listUsersRes.body.users.length).toBeLessThanOrEqual(5);
  });

  test('list users with name filter', async () => {
    const [, userToken] = await registerUser(request(app));
    const uniqueName = 'FilterTarget_' + randomName();
    await registerUserWithName(request(app), uniqueName);
    
    const listUsersRes = await request(app)
      .get(`/api/user?name=${uniqueName}`)
      .set('Authorization', 'Bearer ' + userToken);
    expect(listUsersRes.status).toBe(200);
    expect(Array.isArray(listUsersRes.body.users)).toBe(true);
    // Should find at least the user we just created with that name
    const matchingUsers = listUsersRes.body.users.filter(u => u.name.includes(uniqueName));
    expect(matchingUsers.length).toBeGreaterThan(0);
  });
  
  test('list users page 0 and page 1 differ when enough users exist', async () => {
    const [, adminToken] = await registerAdminUser(request(app));
  
    // Register enough users to span two pages of size 1
    await registerUser(request(app));
    await registerUser(request(app));
  
    const page0Res = await request(app)
      .get('/api/user?page=0&limit=1')
      .set('Authorization', 'Bearer ' + adminToken);
  
    const page1Res = await request(app)
      .get('/api/user?page=1&limit=1')
      .set('Authorization', 'Bearer ' + adminToken);
  
    expect(page0Res.status).toBe(200);
    expect(page1Res.status).toBe(200);
  
    // They should be different pages of data
    const ids0 = page0Res.body.users.map((u) => u.id);
    const ids1 = page1Res.body.users.map((u) => u.id);
    const overlap = ids0.filter((id) => ids1.includes(id));
    expect(overlap.length).toBe(0);
  
    // page 0 should report more=true
    expect(page0Res.body.more).toBe(true);
  });
  
});

describe('Delete user tests', () => {
  
  test('delete user unauthorized', async () => {
    const [user] = await registerUser(request(app));
    
    const deleteRes = (await request(app).delete(`/api/user/${user.id}`));
    expect(deleteRes.status).toBe(401);
  });
  
  test('delete user as self is forbidden', async () => {
    // A non-admin user should not be able to delete themselves (or others)
    const [user, userToken] = await registerUser(request(app));

    const deleteRes = await request(app)
      .delete(`/api/user/${user.id}`)
      .set('Authorization', 'Bearer ' + userToken);

    // Only admins can delete users
    expect(deleteRes.status).toBe(403);
  });
  
  test('delete user as admin succeeds', async () => {
    const [, adminToken] = await registerAdminUser(request(app));
    const [targetUser] = await registerUser(request(app));

    const deleteRes = await request(app)
      .delete(`/api/user/${targetUser.id}`)
      .set('Authorization', 'Bearer ' + adminToken);

    expect(deleteRes.status).toBe(200);

    // Confirm the user is gone from the list
    const listRes = await request(app)
      .get(`/api/user?name=${targetUser.name}`)
      .set('Authorization', 'Bearer ' + adminToken);

    const stillExists = listRes.body.users.some((u) => u.id === targetUser.id);
    expect(stillExists).toBe(false);
  });
  
  test('delete non-existent user returns 404', async () => {
    const [, adminToken] = await registerAdminUser(request(app));

    const deleteRes = await request(app)
      .delete('/api/user/999999999')
      .set('Authorization', 'Bearer ' + adminToken);

    expect(deleteRes.status).toBe(404);
  });
  
});