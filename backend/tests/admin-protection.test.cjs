const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const app = require('../src/app.ts').default;
const { prisma } = require('../src/config/prisma.ts');
const { createUser, updateUser, deleteUser } = require('../src/services/user.service.ts');

(async () => {
  // Testing the last admin requires an isolated, initially empty user table.
  assert.equal(await prisma.user.count(), 0,
    'Run admin-protection tests on a separate migrated test database with no existing users.');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const fixtureIds = [], password = 'AdminProtectionFixture123', tag = Date.now();
  let counter = 0;
  const api = async (method, path, body, token) => {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  const fixture = async (role = 'ADMIN') => {
    const key = `${tag}_${++counter}`;
    const user = await createUser({ username: 'admin_guard_' + key, email: `guard_${key}@example.com`, password, role });
    fixtureIds.push(user.id);
    const login = await api('POST', '/auth/login', { email: user.email, password });
    assert.equal(login.status, 200);
    return { ...user, token: login.body.data.accessToken };
  };
  const clearFixtures = async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: fixtureIds } } });
    await prisma.user.deleteMany({ where: { id: { in: fixtureIds } } });
  };
  const concurrent = async actions => {
    let unlock, ready;
    const entered = new Promise(resolve => { ready = resolve; });
    const release = new Promise(resolve => { unlock = resolve; });
    // Hold the shared mutation lock until both HTTP requests have passed auth
    // and are waiting inside their service transactions, rather than relying on timing.
    const blocker = prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(71913, 1)`;
      ready();
      await release;
    }, { timeout: 15000 });
    await entered;
    const responses = Promise.allSettled(actions.map(action => action()));
    try {
      let waiting = 0;
      for (let i = 0; i < 250; i++) {
        const rows = await prisma.$queryRaw`
          SELECT count(*)::int AS waiting FROM pg_locks
          WHERE locktype = 'advisory' AND classid = 71913 AND objid = 1 AND NOT granted
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`;
        waiting = rows[0].waiting;
        if (waiting >= actions.length) break;
        await delay(10);
      }
      assert.equal(waiting, actions.length, 'Both requests must reach the transaction before releasing the lock');
    } finally { unlock(); }
    await blocker;
    return (await responses).map(result => {
      assert.equal(result.status, 'fulfilled');
      return result.value;
    });
  };

  try {
    const a = await fixture(), scout = await fixture('SCOUT');
    const blocked = await api('PATCH', `/users/${a.id}`, { role: 'SCOUT', username: 'must_not_change', password: 'MustNotChangeFixture456' }, a.token);
    assert.equal(blocked.status, 409); assert(blocked.body.message.includes('cuối cùng'));
    assert.equal((await prisma.user.findUnique({ where: { id: a.id } })).username, a.username);
    const selfDelete = await api('DELETE', `/users/${a.id}`, undefined, a.token);
    assert.equal(selfDelete.status, 409); assert(selfDelete.body.message.includes('cuối cùng'));
    assert.equal(await prisma.user.count({ where: { role: 'ADMIN' } }), 1);
    assert.equal((await api('GET', '/auth/me', undefined, a.token)).status, 200, 'Denied update must leave the password/session intact');
    assert.equal((await api('DELETE', `/users/${a.id}`)).status, 401);
    assert.equal((await api('PATCH', `/users/${a.id}`, { role: 'SCOUT' }, scout.token)).status, 403);
    assert.equal((await api('DELETE', `/users/2147483647`, undefined, a.token)).status, 404);

    const b = await fixture();
    const ownRole = await api('PATCH', `/users/${a.id}`, { role: 'SCOUT' }, a.token);
    assert.equal(ownRole.status, 409); assert(ownRole.body.message.includes('chính mình'));
    assert.equal((await api('DELETE', `/users/${a.id}`, undefined, a.token)).status, 409);
    const replacementPassword = 'ReplacementAdminFixture456';
    assert.equal((await api('PATCH', `/users/${a.id}`, { username: a.username + '_ok', password: replacementPassword, role: 'ADMIN' }, a.token)).status, 200);
    assert.equal((await api('GET', '/auth/me', undefined, a.token)).status, 401);
    const newSession = await api('POST', '/auth/login', { email: a.email, password: replacementPassword });
    assert.equal(newSession.status, 200); a.token = newSession.body.data.accessToken;
    const created = await api('POST', '/users', { username: 'managed_' + tag, email: `managed_${tag}@example.com`, password, role: 'SCOUT' }, a.token);
    assert.equal(created.status, 201); fixtureIds.push(created.body.data.id);
    assert(!Object.hasOwn(created.body.data, 'passwordHash'));
    assert.equal((await api('PATCH', `/users/${created.body.data.id}`, { role: 'ADMIN' }, a.token)).status, 200);
    assert.equal((await api('PATCH', `/users/${created.body.data.id}`, { role: 'SCOUT' }, a.token)).status, 200);
    assert.equal((await api('DELETE', `/users/${created.body.data.id}`, undefined, a.token)).status, 204);

    const demotions = await concurrent([
      () => api('PATCH', `/users/${b.id}`, { role: 'SCOUT' }, a.token),
      () => api('PATCH', `/users/${a.id}`, { role: 'SCOUT' }, b.token),
    ]);
    assert.deepEqual(demotions.map(r => r.status).sort(), [200, 403]);
    assert.equal(await prisma.user.count({ where: { role: 'ADMIN' } }), 1);
    const demoted = await prisma.user.findFirst({ where: { id: { in: [a.id, b.id] }, role: 'SCOUT' } });
    const stale = demoted.id === a.id ? a : b;
    await assert.rejects(updateUser(stale.id === a.id ? b.id : a.id, { role: 'SCOUT' }, stale.id), e => e.status === 403);
    await assert.rejects(deleteUser(stale.id === a.id ? b.id : a.id, stale.id), e => e.status === 403);
    const staleCreate = await api('POST', '/users', { username: 'forbidden_' + tag, email: `forbidden_${tag}@example.com`, password, role: 'ADMIN' }, stale.token);
    assert.equal(staleCreate.status, 403);
    console.log('PASS: last-admin/self protection, rollback, ordinary account management, concurrent mutual demotion, and stale actor rejection.');

    for (const mixed of [false, true]) {
      await clearFixtures();
      const x = await fixture(), y = await fixture();
      const responses = await concurrent([
        () => api('DELETE', `/users/${y.id}`, undefined, x.token),
        () => api(mixed ? 'PATCH' : 'DELETE', `/users/${x.id}`, mixed ? { role: 'SCOUT' } : undefined, y.token),
      ]);
      const statuses = responses.map(r => r.status).sort();
      assert.deepEqual(statuses, mixed && statuses.includes(200) ? [200, 403] : [204, 403]);
      assert.equal(await prisma.user.count({ where: { role: 'ADMIN' } }), 1);
      const winner = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      const winnerToken = winner.id === x.id ? x.token : y.token;
      assert.equal((await api('DELETE', `/users/${winner.id}`, undefined, winnerToken)).status, 409);
      assert.equal((await api('PATCH', `/users/${winner.id}`, { role: 'SCOUT' }, winnerToken)).status, 409);
    }
    console.log('PASS: simultaneous mutual deletion and mixed delete/demotion preserve an admin; both requests verified inside transactions.');
  } finally {
    await clearFixtures();
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
})().catch(async error => {
  console.error(error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
