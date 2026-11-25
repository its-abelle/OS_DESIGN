const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { join } = require('node:path');

function createApp() {
  const nodes = new Map();
  const timers = new Map();
  let timerId = 0;
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: true, dataset: {}, listeners: {}, clicks: 0,
      setAttribute() {},
      addEventListener(event, handler) { this.listeners[event] = handler; },
      click() { this.clicks++; },
    });
    return nodes.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: get, addEventListener() {}, body: { dataset: {} } },
    window: { matchMedia: () => ({ matches: true, addEventListener() {} }) },
    fetch: () => new Promise(() => {}),
    AbortSignal, AbortController, URLSearchParams,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(readFileSync(join(__dirname, '../public/app.js'), 'utf8'), context);
  return { context, get, timers };
}

test('file picker actions and notification lifetime', () => {
  const { context, get, timers } = createApp();
  get('choose-upload').listeners.click();
  get('empty-choose').listeners.click();
  assert.equal(get('file-input').clicks, 2);

  context.message('File uploaded');
  assert.equal(get('notice').hidden, false);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 5000);
  const firstTimer = [...timers.keys()][0];
  context.message('Another file uploaded');
  assert.equal(timers.has(firstTimer), false);
  assert.equal(timers.size, 1);
  [...timers.values()][0].callback();
  assert.equal(get('notice').hidden, true);

  context.message('File uploaded');
  context.message('Upload failed', true);
  assert.equal(timers.size, 0);
  assert.equal(get('notice').hidden, false);
  get('dismiss-notice').listeners.click();
  assert.equal(get('notice').hidden, true);
});

test('pagination replaces rows, preserves search and resets on a new query', async () => {
  const { context, get } = createApp();
  vm.runInContext('user = { username: "test" }', context);
  context.renderFiles = () => {};
  const requests = [];
  context.api = async (url) => {
    requests.push(url);
    const params = new URLSearchParams(url.split('?')[1]);
    return { files: [{ id: params.has('before') ? 8 : 10 }],
      nextCursor: params.has('before') ? null : 9, maxUploadBytes: 10485760 };
  };
  await context.loadFiles(0, undefined, 'invoice & notes');
  assert.equal(new URLSearchParams(requests[0].split('?')[1]).get('search'), 'invoice & notes');
  assert.equal(new URLSearchParams(requests[0].split('?')[1]).get('limit'), '10');
  assert.equal(get('previous-page').disabled, true);
  assert.equal(get('next-page').disabled, false);
  await context.loadFiles(1);
  const next = new URLSearchParams(requests[1].split('?')[1]);
  assert.equal(next.get('before'), '9');
  assert.equal(next.get('search'), 'invoice & notes');
  assert.equal(vm.runInContext('files.length', context), 1);
  assert.equal(vm.runInContext('files[0].id', context), 8);
  assert.equal(get('previous-page').disabled, false);
  assert.equal(get('next-page').disabled, true);
  await context.loadFiles(0);
  assert.equal(new URLSearchParams(requests[2].split('?')[1]).has('before'), false);
  await context.loadFiles(0, undefined, 'other');
  const fresh = new URLSearchParams(requests[3].split('?')[1]);
  assert.equal(fresh.get('search'), 'other');
  assert.equal(fresh.has('before'), false);
  assert.equal(vm.runInContext('currentPage', context), 0);
});
