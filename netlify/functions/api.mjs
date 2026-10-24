import { getStore } from '@netlify/blobs';
import Engine from '../../shared/engine.js';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

export default async (req) => {
  try {
    const store = getStore('foodbridge');

    // Health check: the website calls this once to know the database works
    if (req.method === 'GET') {
      await store.get('db');
      return json({ ok: true });
    }
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const body = await req.json();
    const { action, ...payload } = body || {};
    const db = (await store.get('db', { type: 'json' })) || Engine.emptyDb();
    const result = await Engine.handle(db, action, payload);
    if (result.changed) await store.setJSON('db', result.db);
    return json({ ok: true, data: result.data });
  } catch (err) {
    if (err && err.userError) return json({ error: err.message }, 400);
    console.error(err);
    return json({ error: 'Server problem. Please try again.' }, 500);
  }
};

export const config = { path: '/api' };
