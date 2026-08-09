#!/usr/bin/env node
/**
 * Fills config placeholders in src/index.html from environment variables
 * and writes the result to dist/. Runs on every Cloudflare Pages deploy.
 *
 * Local:  GCC_CLIENT_ID=… GCC_ENDPOINT=… node build.js
 *         (or put them in a .env file, which is gitignored)
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'dist');

// ---- load .env for local builds (Cloudflare provides real env vars) ----
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const env = process.env;
const problems = [];

// ---- required ----
const CLIENT_ID = (env.GCC_CLIENT_ID || '').trim();
if (!CLIENT_ID) {
  problems.push('GCC_CLIENT_ID is not set.');
} else if (!/\.apps\.googleusercontent\.com$/.test(CLIENT_ID)) {
  problems.push('GCC_CLIENT_ID should end in .apps.googleusercontent.com — got: ' + CLIENT_ID);
}

// ---- endpoint: real URL, or the same-origin proxy ----
const USE_PROXY = /^(1|true|yes)$/i.test(env.GCC_USE_PROXY || '');
let ENDPOINT;
if (USE_PROXY) {
  ENDPOINT = '/api/submit';
  if (!(env.GCC_ENDPOINT || '').trim()) {
    problems.push('GCC_USE_PROXY is on, so the Pages Function needs GCC_ENDPOINT set too.');
  }
} else {
  ENDPOINT = (env.GCC_ENDPOINT || '').trim();
  if (!ENDPOINT) {
    problems.push('GCC_ENDPOINT is not set.');
  } else if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(ENDPOINT)) {
    problems.push('GCC_ENDPOINT should be an Apps Script web app URL ending in /exec — got: ' + ENDPOINT);
  }
}

// ---- optional, with defaults ----
const DOMAIN   = (env.GCC_DOMAIN   || 'gsfcuniversity.ac.in').trim();
const DEADLINE = (env.GCC_DEADLINE || '15 Aug 2026').trim();

if (problems.length) {
  console.error('\nBuild stopped — fix these in Cloudflare Pages → Settings → Variables and secrets:\n');
  problems.forEach(p => console.error('  · ' + p));
  console.error('');
  process.exit(1);
}

// ---- build ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });

const values = {
  __GCC_CLIENT_ID__: CLIENT_ID,
  __GCC_ENDPOINT__:  ENDPOINT,
  __GCC_DOMAIN__:    DOMAIN,
  __GCC_DEADLINE__:  DEADLINE
};

const page = path.join(OUT, 'index.html');
let html = fs.readFileSync(page, 'utf8');
for (const [token, value] of Object.entries(values)) {
  if (!html.includes(token)) {
    console.error('Build stopped — placeholder ' + token + ' is missing from src/index.html.');
    process.exit(1);
  }
  html = html.split(token).join(escapeForJsString(value));
}
fs.writeFileSync(page, html);

console.log('Built dist/index.html');
console.log('  domain lock : ' + DOMAIN);
console.log('  deadline    : ' + DEADLINE);
console.log('  submits to  : ' + ENDPOINT + (USE_PROXY ? '  (proxied by Pages Function)' : ''));

function escapeForJsString(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, '');
}
