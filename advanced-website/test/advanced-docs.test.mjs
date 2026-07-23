import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMatches, inferAuth } from '../scripts/generate-content.mjs';
import { groups, pages } from '../src/content.js';

test('curated portal navigation is complete and bilingual', () => {
  assert.ok(groups.length >= 7);
  assert.ok(pages.length >= 25);
  const ids = new Set();
  for (const page of pages) {
    assert.ok(page.id && !ids.has(page.id));
    ids.add(page.id);
    assert.ok(groups.some((group) => group.id === page.group));
    assert.ok(page.title.ru && page.title.en);
    assert.ok(page.description.ru && page.description.en);
    assert.ok(page.body.ru && page.body.en);
  }
});

test('source extractor indexes routes, request fields, realtime references, and stable errors', () => {
  const source = `
    app.use('/api/v4/trust', context, authRequired);
    app.post('/api/v4/trust/devices/:deviceId', async (request, response) => {
      const displayName = request.body?.displayName;
      const verbose = request.query?.verbose;
      const csrf = request.headers['x-nexora-csrf'];
      if (!displayName) throw new TrustCoreError('bad', 'TRUST_VALIDATION_FAILED', 400);
      io.to('user:1').emit('trust.device_registered', { displayName });
      emitUser('1', 'trust:event', { displayName });
      response.status(201).json({ ok: true, deviceId: request.params.deviceId });
    });
    socket.on('message:send', handler);
    const item = { code: 'PERMISSION_DENIED' };
  `;
  const result = collectMatches(source, '/repo/server/example.cjs');
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].method, 'POST');
  assert.equal(result.routes[0].path, '/api/v4/trust/devices/:deviceId');
  assert.match(result.routes[0].auth, /authenticated session/);
  assert.deepEqual(result.routes[0].request.params, ['deviceId']);
  assert.deepEqual(result.routes[0].request.query, ['verbose']);
  assert.deepEqual(result.routes[0].request.body, ['displayName']);
  assert.ok(result.routes[0].request.headers.includes('x-nexora-csrf'));
  assert.ok(result.routes[0].errors.includes('TRUST_VALIDATION_FAILED'));
  assert.ok(result.sockets.some((item) => item.event === 'trust.device_registered' && item.direction === 'emit'));
  assert.ok(result.sockets.some((item) => item.event === 'trust:event' && item.direction === 'emit'));
  assert.ok(result.sockets.some((item) => item.event === 'message:send' && item.direction === 'receive'));
  assert.ok(result.errors.some((item) => item.code === 'PERMISSION_DENIED'));
  assert.ok(result.errors.some((item) => item.code === 'TRUST_VALIDATION_FAILED'));
});

test('auth inference remains conservative', () => {
  assert.match(inferAuth('/api/login', ''), /public/);
  assert.equal(inferAuth('/api/rooms/1', 'requireOwner(request)'), 'room owner');
  assert.match(inferAuth('/api/private', '', ['/api']), /authenticated/);
  assert.match(inferAuth('/api/unknown', ''), /inspect source guard/);
});
