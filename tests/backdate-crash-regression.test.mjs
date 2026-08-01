import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '..');
const index = fs.readFileSync(path.join(repoDir, 'www', 'index.html'), 'utf8');

function section(start, end) {
  const from = index.indexOf(start);
  const to = index.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing section ${start}`);
  return index.slice(from, to);
}

test('back-date selection coalesces work onto the next frame', () => {
  const selectedDate = section('function setSelectedDate(d){', 'function stepSelectedDate');
  assert.match(selectedDate, /scheduleSelectedDateRender\(\);/);
  assert.doesNotMatch(selectedDate, /renderHome\(\);\s*}catch\(e\)\{\}\s*try\{\s*renderToday/);
  assert.match(selectedDate, /token!==__selectedDateRenderToken/);
  assert.match(selectedDate, /requestAnimationFrame\(run\)/);
});

test('mobile Home renders one shared daily brief and skips the hidden Today surface', () => {
  const navigation = section('function switchView(name){', 'function isWideRail');
  assert.match(navigation, /const brief=buildTodayBrief\(viewDate\(\)\);/);
  assert.match(navigation, /renderHome\(brief\);/);
  assert.match(navigation, /if\(isWideRail\(\)\) renderToday\(brief\);/);

  const home = section('function renderHome(brief){', 'function renderToday(brief){');
  assert.match(home, /const b = brief\|\|buildTodayBrief\(viewDate\(\)\);/);
  const today = section('function renderToday(brief){', 'function renderTodayDateBar');
  assert.match(today, /const b = brief\|\|buildTodayBrief\(t\);/);
});

test('daily brief cache parses an unchanged large source only once and invalidates on write', () => {
  const cacheSource = section(
    'var __briefJsonCache=Object.create(null);',
    'function briefScopeRows'
  );
  const values = new Map([['large', JSON.stringify({ version: 1, rows: [1, 2, 3] })]]);
  let parses = 0;
  const context = {
    safeGet(key) {
      return values.has(key) ? values.get(key) : null;
    },
    tryJSON(raw) {
      parses++;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(`${cacheSource}; this.briefJson = briefJson;`, context);

  const first = context.briefJson('large', {});
  const second = context.briefJson('large', {});
  assert.equal(first, second);
  assert.equal(parses, 1);

  values.set('large', JSON.stringify({ version: 2, rows: [4] }));
  const changed = context.briefJson('large', {});
  assert.equal(changed.version, 2);
  assert.equal(parses, 2);
});

test('daily brief reads heavy histories through the cache without reparsing Cash', () => {
  const brief = section('function buildTodayBrief(dIso){', 'function timeGreeting');
  for (const key of [
    'saagar_wsf_v2',
    'gm_expenses',
    'tanishq_statements',
    'leavedesk_v3',
    'taxcal_v2'
  ]) {
    assert.match(brief, new RegExp(`briefJson\\('${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.doesNotMatch(brief, /computeCashDay\(/);
  assert.match(brief, /cashRec\.filledBy\|\|cashRec\.closed/);
});
