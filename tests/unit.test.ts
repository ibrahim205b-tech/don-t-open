import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, html, jsonScript, paragraphs } from '../src/lib/html.ts';
import { normalizeArabic, normalizePhone, searchText, toFtsQuery, waLink } from '../src/lib/arabic.ts';
import { hashPassword, passwordProblem, verifyPassword } from '../src/lib/password.ts';
import { base32Encode, totpAt, verifyTotp } from '../src/lib/totp.ts';
import { sniffImage } from '../src/lib/images.ts';
import { assignableRoles, can, canManageUser } from '../src/auth/rbac.ts';
import { parsePostForm } from '../src/domain/posts.ts';
import { cleanSetting } from '../src/domain/settings.ts';

test('html template escapes every interpolated value', () => {
  const evil = `<img src=x onerror="alert(1)">'&`;
  assert.equal(html`<p title="${evil}">${evil}</p>`.value, `<p title="${escapeHtml(evil)}">${escapeHtml(evil)}</p>`);
  assert.ok(!html`${evil}`.value.includes('<img'));
  assert.equal(paragraphs('a<b\n\nc').value, '<p>a&lt;b</p><p>c</p>');
  assert.ok(!jsonScript({ x: '</script><script>alert(1)</script>' }).value.includes('</script><script>'));
});

test('arabic normalisation unifies letters, removes diacritics and converts digits', () => {
  assert.equal(normalizeArabic('مَطْعَمُ الأَمِيرة ٣'), 'مطعم الاميره 3');
  assert.equal(normalizeArabic('إبراهيم'), normalizeArabic('ابراهيم'));
  assert.equal(toFtsQuery(`" OR 1=1 --`), '"or"*');
  assert.equal(toFtsQuery('ا'), null);
  assert.equal(toFtsQuery('الإيجار'), '"ايجار"*');
  assert.equal(searchText('للإيجار'), 'للايجار ايجار');
});

test('phone numbers are normalised to 07XXXXXXXXX', () => {
  assert.equal(normalizePhone('+964 776 343 8000'), '07763438000');
  assert.equal(normalizePhone('٠٧٧٦٣٤٣٨٠٠٠'), '07763438000');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(waLink('07763438000'), 'https://wa.me/9647763438000');
});

test('passwords are hashed with scrypt and verified in constant time', async () => {
  const h = await hashPassword('a-long-pass-phrase');
  assert.match(h, /^scrypt\$/);
  assert.ok(!h.includes('a-long-pass-phrase'));
  assert.equal(await verifyPassword('a-long-pass-phrase', h), true);
  assert.equal(await verifyPassword('wrong-pass-phrase', h), false);
  assert.ok(passwordProblem('short'));
  assert.ok(passwordProblem('1234567890'));
  assert.ok(passwordProblem('x7763438000y', '07763438000'));
});

test('TOTP matches RFC 6238 test vectors and rejects reuse', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totpAt(secret, Math.floor(59 / 30)), '287082');
  assert.equal(totpAt(secret, Math.floor(1111111109 / 30)), '081804');
  const step = verifyTotp(secret, '081804', null, 1111111109 * 1000);
  assert.equal(step, Math.floor(1111111109 / 30));
  assert.equal(verifyTotp(secret, '081804', step, 1111111109 * 1000), null);
});

test('image sniffing ignores names and checks bytes', () => {
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImage(Buffer.from('<?php echo 1; ?>          ')), null);
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpeg');
});

test('RBAC: least privilege and no self-promotion to super admin', () => {
  assert.equal(can('user', 'admin.access'), false);
  assert.equal(can('business_owner', 'posts.moderate'), false);
  assert.equal(can('moderator', 'posts.moderate'), true);
  assert.equal(can('moderator', 'settings.manage'), false);
  assert.equal(can('moderator', 'users.manage'), false);
  assert.equal(can('admin', 'settings.manage'), true);
  assert.ok(!assignableRoles('super_admin').includes('super_admin'));
  assert.ok(!assignableRoles('admin').includes('admin'));
  assert.deepEqual(assignableRoles('moderator'), []);
  assert.equal(canManageUser({ id: 1, role: 'admin' }, { id: 1, role: 'admin' }), false);
  assert.equal(canManageUser({ id: 1, role: 'admin' }, { id: 2, role: 'admin' }), false);
  assert.equal(canManageUser({ id: 1, role: 'admin' }, { id: 2, role: 'user' }), true);
});

test('post form rejects unknown fields such as status or role', () => {
  const base = { title: 'عنوان تجريبي', category_id: '1', area_id: '1', contact_phone: '07701234567', d_condition: 'used' };
  assert.equal(parsePostForm('market', base).ok, true);
  for (const extra of [{ status: 'published' }, { role: 'super_admin' }, { approved_by: '1' }, { user_id: '2' }]) {
    const r = parsePostForm('market', { ...base, ...extra });
    assert.equal(r.ok, false, JSON.stringify(extra));
  }
  const help = parsePostForm('help', { title: 'طلب تبرع بالدم', category_id: '1', area_id: '1', show_phone: 'on', contact_phone: '07701234567' });
  assert.equal(help.ok, false, 'help requests need consent');
});

test('settings validation rejects markup and non-https links', () => {
  assert.ok('error' in cleanSetting('site_name', '<script>'));
  assert.ok('error' in cleanSetting('facebook_url', 'javascript:alert(1)'));
  assert.ok('error' in cleanSetting('facebook_url', 'http://example.com'));
  assert.deepEqual(cleanSetting('support_phone', '+9647763438000'), { value: '07763438000' });
  assert.ok('error' in cleanSetting('unknown_key', 'x'));
});
