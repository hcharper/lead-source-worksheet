/*
 * Builds index.html: the worksheet page, encrypted, behind gate.html's password form.
 *
 *   node build.mjs                 build with the settings in private/config.json
 *   node build.mjs --api <url>     set the Apps Script web-app URL, then build
 *   node build.mjs --password <p>  change the password (everyone must re-enter it), then build
 *
 * private/ is gitignored and holds everything readable: the page source, the lead counts,
 * the password and the sheet URL. Only the ciphertext in index.html is ever committed.
 * The salt is kept across builds so "Remember on this device" survives a rebuild.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { webcrypto as crypto, randomBytes, createHash } from 'node:crypto';

const ITER = 600_000;
const P = new URL('./private/', import.meta.url);
const read = f => readFileSync(new URL(f, P), 'utf8');
const args = process.argv.slice(2);
const arg = f => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);

const words = ['harbor', 'lantern', 'meadow', 'copper', 'signal', 'orchard', 'granite', 'tidewater',
  'balcony', 'keystone', 'skyline', 'foyer', 'terrace', 'gallery', 'atrium', 'cornice'];
const cfgFile = new URL('config.json', P);
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {};
if (!cfg.salt) cfg.salt = randomBytes(16).toString('base64');
if (arg('--password')) cfg.password = arg('--password');
if (!cfg.password) {
  const pick = () => words[randomBytes(1)[0] % words.length];
  cfg.password = `${pick()}-${pick()}-${randomBytes(2).readUInt16BE() % 9000 + 1000}`;
}
if (arg('--api')) cfg.api = arg('--api');
writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');

const app = read('app.js')
  .replace('/*DATA*/null', () => read('pagedata.json'))
  .replace('/*SEED*/null', () => read('seed.json'));
const round1 = '<!doctype html>\n<html lang="en">\n' + read('head.html')
  + `<script>\nwindow.LSW = { api: ${JSON.stringify(cfg.api || '')}, token: /*TOKEN*/null };\n${app}\n</script>\n</html>\n`;

// Round 2 reuses round 1's design tokens and base styles, so the two pages read as one site.
const baseStyle = read('head.html').match(/<style>([\s\S]*?)<\/style>/)[1];
const round2 = read('round2.html')
  .replace('/*BASESTYLE*/', () => baseStyle)
  .replace('/*API*/null', () => JSON.stringify(cfg.api || ''))
  .replace('/*COUNTS*/null', () => read('round2-counts.json'));

const te = new TextEncoder();
const base = await crypto.subtle.importKey('raw', te.encode(cfg.password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt: Buffer.from(cfg.salt, 'base64'), iterations: ITER, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const gateTemplate = readFileSync(new URL('./gate.html', import.meta.url), 'utf8');
const v = createHash('sha256').update(cfg.salt + cfg.password).digest('hex').slice(0, 8);

async function seal(html, out) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(html));
  const payload = { v, salt: cfg.salt, iter: ITER, iv: iv.toString('base64'), ct: Buffer.from(ct).toString('base64') };
  const page = gateTemplate.replace('/*PAYLOAD*/null', () => JSON.stringify(payload));
  writeFileSync(new URL('./' + out, import.meta.url), page);
  console.log(`${out} written (${(page.length / 1024).toFixed(0)} KB)`);
}
await seal(round1, 'index.html');
await seal(round2, 'round2.html');

const token = createHash('sha256').update('lsw-api:' + cfg.password).digest('hex');
console.log(`password:      ${cfg.password}`);
console.log(`sheet TOKEN:   ${token}`);
console.log(`sheet URL:     ${cfg.api || '(not set — run with --api <url> once the Apps Script is deployed)'}`);
