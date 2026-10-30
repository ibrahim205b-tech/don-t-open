import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { openDatabase } from '../src/db/index.ts';
import { hashPassword } from '../src/lib/password.ts';
import type { Role } from '../src/domain/types.ts';

export const BASE = 'http://localhost';
export const PASSWORD = 'correct-horse-battery';

export async function makeApp(overrides: Partial<Config> = {}): Promise<FastifyInstance> {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dalil-test-'));
  const cfg = loadConfig({ baseUrl: BASE, databasePath: ':memory:', uploadDir, adminRequireMfa: false, cookieSecure: false, ...overrides },
    { NODE_ENV: 'test', SESSION_SECRET: 'test-secret-'.padEnd(48, 'x') });
  const db = openDatabase(':memory:');
  const app = await buildApp(cfg, { db, logger: false, jobs: false });
  app.addHook('onClose', async () => { db.close(); fs.rmSync(uploadDir, { recursive: true, force: true }); });
  return app;
}

let phoneSeq = 1000000;
export const nextPhone = () => `077${String(phoneSeq++).padStart(8, '0')}`;

export async function createUser(app: FastifyInstance, role: Role = 'user', name = 'مستخدم اختبار'): Promise<{ id: number; phone: string }> {
  const phone = nextPhone();
  const id = Number(app.db.prepare("INSERT INTO users (name, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, unixepoch() - 7 * 86400)")
    .run(name, phone, await hashPassword(PASSWORD), role).lastInsertRowid);
  return { id, phone };
}

export interface Res { status: number; body: string; headers: Record<string, string | string[] | undefined> }
export interface FileField { name: string; filename: string; type: string; data: Buffer }

export function multipart(fields: Record<string, string | string[]>, files: FileField[] = []) {
  const boundary = '----dalil' + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    for (const val of Array.isArray(v) ? v : [v]) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${val}\r\n`));
  }
  for (const f of files) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"; filename="${f.filename}"\r\nContent-Type: ${f.type}\r\n\r\n`), f.data, Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** متصفح مبسّط: يحفظ الكوكيز ويقرأ رمز CSRF من الصفحات. */
export class Agent {
  cookies = new Map<string, string>();
  loggedIn = false;
  readonly app: FastifyInstance;
  constructor(app: FastifyInstance) { this.app = app; }

  private store(h: string | string[] | undefined) {
    for (const c of Array.isArray(h) ? h : h ? [h] : []) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
      const expired = attrs.some((a) => /max-age=0/i.test(a) || /expires=thu, 01 jan 1970/i.test(a));
      if (expired || value === '') this.cookies.delete(name); else this.cookies.set(name, value);
    }
  }

  async request(method: string, url: string, opts: { form?: Record<string, string | string[]>; multipart?: { payload: Buffer; contentType: string }; headers?: Record<string, string>; origin?: string | null } = {}): Promise<Res> {
    const headers: Record<string, string> = { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...opts.headers };
    if (method !== 'GET' && opts.origin !== null) headers.origin = opts.origin ?? BASE;
    let payload: string | Buffer | undefined;
    if (opts.form) {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.form)) for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
      payload = p.toString(); headers['content-type'] = 'application/x-www-form-urlencoded';
    } else if (opts.multipart) { payload = opts.multipart.payload; headers['content-type'] = opts.multipart.contentType; }
    const r = await this.app.inject({ method: method as 'GET', url, headers, payload });
    this.store(r.headers['set-cookie'] as string | string[] | undefined);
    return { status: r.statusCode, body: r.body, headers: r.headers as Res['headers'] };
  }

  get(url: string) { return this.request('GET', url); }

  async token(): Promise<string> {
    const r = await this.get(this.cookies.has('sid') ? '/account/settings' : '/login');
    const m = r.body.match(/name="_csrf" value="([^"]+)"/);
    if (!m) throw new Error('no csrf token on page (status ' + r.status + ')');
    return m[1];
  }

  async post(url: string, form: Record<string, string | string[]> = {}, opts: { origin?: string | null; csrf?: boolean } = {}) {
    const f = opts.csrf === false ? form : { _csrf: await this.token(), ...form };
    return this.request('POST', url, { form: f, origin: opts.origin });
  }

  async postMultipart(url: string, fields: Record<string, string | string[]>, files: FileField[] = []) {
    return this.request('POST', url, { multipart: multipart({ _csrf: await this.token(), ...fields }, files) });
  }

  async login(phone: string, password = PASSWORD) {
    const r = await this.post('/login', { phone, password });
    this.loggedIn = r.status === 303 && this.cookies.has('sid');
    return r;
  }
}

export async function pngImage(w = 200, h = 150): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: '#2a7' } }).png().toBuffer();
}

export function categoryId(app: FastifyInstance, section: string): number {
  return app.db.prepare('SELECT id FROM categories WHERE section = ? ORDER BY sort LIMIT 1').pluck().get(section) as number;
}
export const areaId = (app: FastifyInstance) => app.db.prepare('SELECT id FROM areas LIMIT 1').pluck().get() as number;

export function jobForm(app: FastifyInstance, title = 'مطلوب كاشير لمحل', extra: Record<string, string> = {}): Record<string, string> {
  return {
    title, body: 'دوام صباحي ومسائي', category_id: String(categoryId(app, 'job')), area_id: String(areaId(app)),
    price: '450000', contact_phone: '07701234567', show_phone: 'on', d_workplace: 'ماركت الحي', d_employment: 'full', action: 'submit', ...extra,
  };
}

export const postStatus = (app: FastifyInstance, id: number) => app.db.prepare('SELECT status FROM posts WHERE id = ?').pluck().get(id) as string;
export const lastPostId = (app: FastifyInstance) => app.db.prepare('SELECT max(id) FROM posts').pluck().get() as number;

export { openDatabase };
