/**
 * Host half of the in-app workspace folder picker.
 *
 * The client half has to list folders STARTING AT A CHOSEN PATH. Neither
 * shipped seam can do that:
 *
 *  - `sidebar.workspaces.directoryFlow` is owned by `DirectoryFlowOwnerProps`,
 *    which carries no seed path at all, and
 *  - the composed `directoryPicker` on a local Windows desktop serves only the
 *    native capability, so `directoryPicker.list` is refused with
 *    `directory-picker/unavailable`.
 *
 * Disabling the shipped picker row to force the browse backend is NOT an
 * option: `@deepseek-ai/dsh-api-workspace-controller` declares
 * `static inject = ["directoryPicker"]`, so removing the only implementation
 * of that service also stops `directoryPickerController` from activating and
 * breaks folder picking for the whole application.
 *
 * So this bundle serves its own two routes over the Host web carrier
 * (`ctx.webServer.register`) and the client half calls them with `fetch`,
 * exactly the way `git-autobackup` does:
 *
 *   GET  /workspace-browse-picker/list?path=<absolute path>
 *   POST /workspace-browse-picker/create   { path, name }
 *
 * Both answer `{ ok: true, value }` or `{ ok: false, message }`, only ever
 * reply to a same-origin request from the local Host, and refuse any path that
 * is not fully qualified so a relative path can never resolve against the
 * Host's current working directory.
 */
import { mkdir, opendir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, win32 } from 'node:path';

export const inject = ['webServer'];

const PREFIX = '/workspace-browse-picker';
const MAX_ENTRIES = 2000;
const BODY_LIMIT = 65536;
const LOCAL_ADDRESS = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/u;

function sendJson(res, status, value) {
  try {
    if (res?.headersSent === true) return;
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(value));
  } catch {
    try {
      if (res?.headersSent !== true) res.statusCode = status;
      res.end();
    } catch {
      /* the peer is already gone */
    }
  }
}

/** Only the loopback authority may browse the Host filesystem. */
function localHost(req) {
  const host = typeof req?.headers?.host === 'string' ? req.headers.host.trim().toLowerCase() : '';
  return host === '' || LOCAL_ADDRESS.test(host);
}

/** Drain a small JSON body; anything larger is refused rather than buffered. */
function readJsonBody(req) {
  return new Promise((done, fail) => {
    let text = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error === null) done(value);
      else fail(error);
    };
    req.on('data', (chunk) => {
      text += String(chunk);
      if (text.length > BODY_LIMIT) {
        finish(new Error('request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (text.trim() === '') return finish(null, {});
      try {
        finish(null, JSON.parse(text));
      } catch {
        finish(new Error('request body is not valid JSON'));
      }
    });
    req.on('error', (error) => finish(error));
  });
}

/** A handler that answers instead of throwing when the route itself breaks. */
function guard(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      sendJson(res, 200, { ok: false, message: describe(error) });
    }
  };
}

function describe(error) {
  switch (error?.code) {
    case 'ENOENT': return 'This folder no longer exists.';
    case 'ENOTDIR': return 'This path is not a folder.';
    case 'EACCES':
    case 'EPERM': return 'You do not have permission to open this folder.';
    case 'EEXIST': return 'A folder with that name already exists.';
    case 'EINVAL': return 'That name is not allowed here.';
    default: return typeof error?.message === 'string' && error.message !== ''
      ? error.message
      : 'The folder could not be read.';
  }
}

/** Absolute, drive-qualified on Windows: never resolved against the cwd. */
function fullyQualified(path) {
  if (typeof path !== 'string' || path === '') return false;
  if (process.platform === 'win32') {
    return win32.isAbsolute(path) && /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/]+[^\\/]+)/u.test(path);
  }
  return path.startsWith('/');
}

function separatorOf(path) {
  return path.includes('\\') ? '\\' : '/';
}

/** Ancestry crumbs from the filesystem root down to `target`. */
function crumbsOf(target) {
  const sep = separatorOf(target);
  const parts = target.split(/[\\/]+/u).filter((part) => part !== '');
  const drive = win32.isAbsolute(target) && /^[A-Za-z]:$/u.test(parts[0] ?? '');
  const root = sep === '\\' ? (drive ? parts[0] + sep : sep) : sep;
  const crumbs = [{ name: root, path: root }];
  let current = root;
  for (let index = drive ? 1 : 0; index < parts.length; index += 1) {
    current = current.endsWith(sep) ? current + parts[index] : current + sep + parts[index];
    crumbs.push({ name: parts[index], path: current });
  }
  return crumbs;
}

/**
 * List one level. Same shape the shipped browse backend returns, so the client
 * half renders exactly what the documented `DirectoryListing` describes.
 *
 * The absolute-path check runs on the REQUESTED string, never on the resolved
 * one: `resolve()` would happily turn `"plugins"` into a folder next to the
 * Host's current working directory, which is not something the browser may
 * reach by accident.
 */
async function listDirectory(requested) {
  const asked = requested === undefined || requested === '' ? homedir() : requested;
  if (!fullyQualified(asked)) throw new Error('A folder path must be absolute.');
  const target = resolve(asked);
  const entries = [];
  let truncated = false;
  const handle = await opendir(target);
  try {
    for await (const entry of handle) {
      if (!(entry.isDirectory() || entry.isSymbolicLink())) continue;
      if (entries.length >= MAX_ENTRIES) {
        truncated = true;
        break;
      }
      entries.push({
        name: entry.name,
        path: join(target, entry.name),
        hidden: entry.name.startsWith('.'),
      });
    }
  } finally {
    await handle.close().catch(() => {});
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  return { path: target, home: homedir(), crumbs: crumbsOf(target), entries, truncated };
}

/** Create one folder inside `parent`. `name` must be a single plain segment. */
async function createDirectory(parent, name) {
  const asked = typeof parent === 'string' && parent !== '' ? parent : homedir();
  if (!fullyQualified(asked)) throw new Error('A folder path must be absolute.');
  const base = resolve(asked);
  const cleaned = typeof name === 'string' ? name.trim() : '';
  if (cleaned === '' || cleaned === '.' || cleaned === '..' || cleaned === '/' || cleaned === '\\'
    || /[\\/]/u.test(cleaned) || /[\u0000-\u001f]/u.test(cleaned)) {
    throw new Error('A folder name must be one plain segment.');
  }
  const target = join(base, cleaned);
  await mkdir(target);
  return target;
}

async function handleList(req, res) {
  if ((req.method ?? 'GET') !== 'GET') {
    return sendJson(res, 405, { ok: false, message: 'method not allowed' });
  }
  if (!localHost(req)) {
    return sendJson(res, 403, { ok: false, message: 'only the local Host may browse folders' });
  }
  let requested;
  try {
    requested = new URL(req.url ?? '/', 'http://localhost').searchParams.get('path') ?? undefined;
  } catch {
    requested = undefined;
  }
  try {
    return sendJson(res, 200, { ok: true, value: await listDirectory(requested) });
  } catch (error) {
    return sendJson(res, 200, { ok: false, message: describe(error) });
  }
}

async function handleCreate(req, res) {
  if ((req.method ?? 'GET') !== 'POST') {
    return sendJson(res, 405, { ok: false, message: 'method not allowed' });
  }
  if (!localHost(req)) {
    return sendJson(res, 403, { ok: false, message: 'only the local Host may create folders' });
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 200, { ok: false, message: describe(error) });
  }
  try {
    return sendJson(res, 200, { ok: true, value: await createDirectory(body?.path, body?.name) });
  } catch (error) {
    return sendJson(res, 200, { ok: false, message: describe(error) });
  }
}

const ROUTES = [
  [PREFIX + '/list', handleList],
  [PREFIX + '/create', handleCreate],
];

function registerRoutes(ctx) {
  const server = typeof ctx.get === 'function' ? ctx.get('webServer') : null;
  if (server === null || server === undefined || typeof server.register !== 'function') {
    console.warn('[workspace-browse-picker] webServer is unavailable;'
      + ' the folder dialog cannot list directories.');
    return () => {};
  }
  const disposers = [];
  for (const [pathname, handler] of ROUTES) {
    try {
      disposers.push(server.register({ kind: 'exact', path: pathname, handler: guard(handler) }));
    } catch (error) {
      console.warn('[workspace-browse-picker] could not register ' + pathname + ':', error);
    }
  }
  return () => {
    for (const dispose of disposers) {
      try {
        dispose();
      } catch (error) {
        console.warn('[workspace-browse-picker] route cleanup failed:', error);
      }
    }
  };
}

export function apply(ctx) {
  ctx.effect(() => registerRoutes(ctx), 'workspace-browse-picker: folder routes');
}
