import { load, dump, JSON_SCHEMA } from '../vendor/js-yaml.mjs';

const SECRET_KEY = /(api[_-]?key|secret|access[_-]?key|token|password|passwd|credential|cookie|authorization|private[_-]?key)/i;
const COUNT_KEY = /(?:max|min|total|budget)[_-]?tokens?$/i;
const INLINE_SECRET = /(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,})/g;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
const KEY_VALUE_SECRET = /((?:api[_-]?key|secret|access[_-]?key|token|password|passwd|credential|authorization)\b\s*[:=]\s*)([^\s,;]+)/gi;
const SENSITIVE_QUERY = /^(?:api[_-]?key|key|token|access[_-]?token|secret|password|passwd|signature|sig|auth|code|credential)$/i;
const BLOCK_KEY = /^(\s*)([A-Za-z0-9_.-]*(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|credential)[A-Za-z0-9_.-]*)\s*:\s*[|>][-+]?\s*$/i;

export function isSecretKey(key) {
  if (typeof key !== 'string') return false;
  if (isCountKey(key)) return false;
  return SECRET_KEY.test(key);
}

export function isCountKey(key) {
  return typeof key === 'string' && COUNT_KEY.test(key);
}

function sanitizeUrl(raw) {
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY.test(key) || isSecretKey(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return '[UNPARSEABLE_URL]';
  }
}

function redactBlockScalars(text) {
  const lines = String(text).split('\n');
  let blockIndent = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (blockIndent !== null) {
      const indent = (line.match(/^\s*/) ?? [''])[0].length;
      if (line.trim() === '' || indent > blockIndent) {
        lines[index] = line.trim() === '' ? line : `${line.slice(0, indent)}[REDACTED]`;
        continue;
      }
      blockIndent = null;
    }
    const match = BLOCK_KEY.exec(line);
    if (match) blockIndent = match[1].length;
  }
  return lines.join('\n');
}

export function redactString(value) {
  if (typeof value !== 'string') return value;
  return redactBlockScalars(value)
    .replace(URL_PATTERN, (url) => sanitizeUrl(url))
    .replace(INLINE_SECRET, '[REDACTED]')
    .replace(KEY_VALUE_SECRET, '$1[REDACTED]');
}

export function sanitizeJson(value, key = '', seen = new WeakSet()) {
  if (isCountKey(key)) return typeof value === 'number' && Number.isFinite(value) ? value : '[INVALID_COUNT]';
  if (isSecretKey(key)) return '[REDACTED]';
  if (value === null || typeof value !== 'object') return redactString(value);
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item, '', seen));
  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = sanitizeJson(childValue, childKey, seen);
  }
  return result;
}

/**
 * Parse the whole YAML document and sanitize its data tree. There is no
 * line-based fallback: an unparseable document is rejected by the caller.
 */
export function sanitizeYaml(text) {
  const data = load(text, { schema: JSON_SCHEMA });
  return dump(sanitizeJson(data), { schema: JSON_SCHEMA, noRefs: true, lineWidth: 120 });
}

export function sanitizeText(text) {
  return redactString(text);
}
