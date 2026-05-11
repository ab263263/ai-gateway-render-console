import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const baseUrl = process.env.NEW_API_BASE_URL || 'https://my-ai-gateway-p6on.onrender.com';
const userId = process.env.NEW_API_USER_ID || '1';
const cookieFile = process.env.NEW_API_COOKIE_FILE || '/tmp/newapi_cookie.txt';
const channelsFile = process.env.NEW_API_CHANNELS_JSON || fileURLToPath(new URL('./newapi-channels.generated.json', import.meta.url));

function readCookieHeader(file) {
  const text = fs.readFileSync(file, 'utf8');
  const cookies = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine) continue;
    const line = rawLine.startsWith('#HttpOnly_') ? rawLine.replace('#HttpOnly_', '') : rawLine;
    if (line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length >= 7) cookies.push(`${parts[5]}=${parts[6]}`);
  }
  return cookies.join('; ');
}

const cookie = readCookieHeader(cookieFile);
const payload = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
let ok = 0;
let failed = 0;

for (const channel of payload.channels) {
  const res = await fetch(`${baseUrl}/api/channel/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
      'New-Api-User': userId,
    },
    body: JSON.stringify({ mode: 'single', channel }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.success) {
    ok++;
    console.log(`[ok] ${channel.name}`);
  } else {
    failed++;
    console.log(`[failed] ${channel.name}: ${data.message || res.status}`);
  }
}

console.log(`Import done: ok=${ok}, failed=${failed}`);
if (failed > 0) process.exit(1);
