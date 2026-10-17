import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { birthdayColor, parseBirthday, dayOfYear, contrast, ensureContrast, themeVars, isHex } from '../app/js/color.js';
import { moveProgress, stopTimes, dayStart } from '../app/js/transit.js';
import { normalizeTrip, newTrip } from '../app/js/model.js';
import { parseImport, serializeTrip, serializeBackup, ImportError } from '../app/js/io.js';
import { navTargets } from '../app/js/nav.js';
import { esc, str } from '../app/js/util.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('誕生日カラー: 同じ月日は同じ色、日が違えば色が違う', () => {
  assert.equal(birthdayColor('03-15'), birthdayColor('03-15'));
  assert.notEqual(birthdayColor('03-15'), birthdayColor('03-16'));
  assert.ok(isHex(birthdayColor('12-31')));
});

test('誕生日の検証: 存在しない日付は拒否、2/29は許可', () => {
  assert.equal(parseBirthday('02-30'), null);
  assert.equal(parseBirthday('13-01'), null);
  assert.equal(parseBirthday('abc'), null);
  assert.deepEqual(parseBirthday('02-29'), { month: 2, day: 29 });
  assert.equal(dayOfYear({ month: 12, day: 31 }), 366);
  assert.equal(dayOfYear({ month: 1, day: 1 }), 1);
});

test('文字色の自動調整: どの誕生日カラーでも白文字用の色は4.5以上', () => {
  for (let m = 1; m <= 12; m++) {
    for (const d of [1, 10, 20, 28]) {
      const mm = String(m).padStart(2, '0');
      const c = birthdayColor(`${mm}-${String(d).padStart(2, '0')}`);
      assert.ok(contrast(ensureContrast(c, '#ffffff', 4.5), '#ffffff') >= 4.5, c);
    }
  }
  const v = themeVars('#ffee00');
  assert.ok(contrast(v['--accent-ink'], '#ffffff') >= 4.5);
});

test('移動の進み具合', () => {
  const s = 1000;
  const e = 3000;
  assert.deepEqual(moveProgress(500, s, e), { state: 'before', p: 0 });
  assert.deepEqual(moveProgress(2000, s, e), { state: 'moving', p: 0.5 });
  assert.deepEqual(moveProgress(3000, s, e), { state: 'arrived', p: 1 });
  assert.equal(moveProgress(2000, e, s).state, 'unknown');
  assert.equal(moveProgress(2000, null, e).state, 'unknown');
});

test('予定の時刻 → ミリ秒(日付未設定ならnull)', () => {
  assert.equal(stopTimes('', 1, '08:00', '09:00'), null);
  const t = stopTimes('2026-11-14', 2, '08:00', '09:30');
  const base = +dayStart('2026-11-14', 2);
  assert.equal(t.start, base + 8 * 3600000);
  assert.equal(t.end, base + 9.5 * 3600000);
});

test('v1データの移行: 参加者名と投票が member ID に変換される', () => {
  const t = normalizeTrip({
    id: 'a', name: '旧', days: 2, people: ['A', 'B'],
    places: [{ id: 'p1', name: '場所', cat: '食事', votes: { 0: true, 1: false }, lat: '35.1', lon: '139.2' }],
    schedule: [{ id: 's1', day: 1, time: '09:00', title: 't', placeId: 'p1', options: ['p1'] }],
  });
  assert.equal(t.members.length, 2);
  assert.deepEqual(Object.keys(t.places[0].votes), [t.members[0].id]);
  assert.equal(t.places[0].lat, 35.1);
  assert.equal(t.schedule[0].placeId, 'p1');
});

test('正規化: 範囲外・不正な値を落とす', () => {
  const t = normalizeTrip({
    name: 'x'.repeat(500), days: 999, date: '2026-02-31',
    places: [{ id: 'p', name: 'n', lat: 999, lon: 1, cat: '不明' }],
    schedule: [{ day: 50, time: '99:99', endTime: '08:00', placeId: 'nope', mode: 'rocket', kind: 'move' }],
    members: [{ name: 'A', color: 'red', birthday: '02-30' }],
    theme: { mode: 'custom', hex: 'javascript:alert(1)' },
  });
  assert.equal(t.name.length, 70);
  assert.equal(t.days, 30);
  assert.equal(t.date, '');
  assert.equal(t.places[0].lat, null);
  assert.equal(t.places[0].cat, 'その他');
  assert.equal(t.schedule[0].day, 30);
  assert.equal(t.schedule[0].time, '12:00');
  assert.equal(t.schedule[0].endTime, '');
  assert.equal(t.schedule[0].mode, 'car');
  assert.ok(isHex(t.members[0].color));
  assert.equal(t.members[0].birthday, '');
  assert.deepEqual(t.theme, { mode: 'inherit' });
});

test('ID の重複と危険な文字は無害化される', () => {
  const t = normalizeTrip({ places: [{ id: 'a"><img>', name: '1' }, { id: 'a"><img>', name: '2' }] });
  const [p1, p2] = t.places;
  assert.notEqual(p1.id, p2.id);
  assert.match(p1.id, /^[\w.-]+$/);
});

test('書き出し・読み込み: 共有用は誕生日を含まない / バックアップは含む', () => {
  const trip = normalizeTrip({ id: 't', name: 'T', members: [{ name: 'A', birthday: '05-05' }, { name: 'B' }] });
  const shared = parseImport(serializeTrip(trip, { share: true }))[0];
  assert.equal(shared.members[0].birthday, '');
  assert.equal(shared.members[0].color, trip.members[0].color);
  const backup = parseImport(serializeBackup([trip]))[0];
  assert.equal(backup.members[0].birthday, '05-05');
  assert.notEqual(backup.id, trip.id);
});

test('読み込み: 不正・巨大なファイルは拒否', () => {
  assert.throws(() => parseImport('{broken'), ImportError);
  assert.throws(() => parseImport('{"hello":1}'), ImportError);
  assert.throws(() => parseImport('x'.repeat(31 * 1024 * 1024)), ImportError);
});

test('ナビURL: 座標あり→カーナビ、なし→検索のみ', () => {
  const a = navTargets({ name: 'テスト施設', location: '駅前', lat: 37.9, lon: 139.06 });
  assert.match(a.yahooCar, /^yjcarnavi:\/\/navi\/select\?lat=37\.9&lon=139\.06&name=/);
  const b = navTargets({ name: 'x', location: '', lat: null, lon: null });
  assert.equal(b.yahooCar, null);
  assert.match(b.yahooMap, /^https:\/\/map\.yahoo\.co\.jp\/search\?q=/);
});

test('エスケープと切り詰め', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(str('🍜🍜🍜', 2), '🍜🍜');
});

test('newTrip は参加者を作る', () => {
  const t = newTrip({ name: 'n', destination: '', date: '', days: 2, memberNames: ['A', 'B', 'C'] });
  assert.equal(t.members.length, 3);
});

test('公開ディレクトリ app/ に私的データやJSONが入っていない', () => {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  const files = walk(join(root, 'app'));
  assert.ok(!files.some((f) => f.endsWith('.json')), 'app/ にJSONがある');
});

test('私的データ(あれば)が読み込める', { skip: !existsSync(join(root, 'private', 'private-trip.json')) }, () => {
  const text = readFileSync(join(root, 'private', 'private-trip.json'), 'utf8');
  const [t] = parseImport(text);
  assert.ok(t.places.length >= 60);
  assert.ok(t.schedule.length >= 15);
});

test('背景: 許可された値だけ通り、不正な値・旧データは plain になる', () => {
  assert.equal(normalizeTrip({ background: 'waves' }).background, 'waves');
  assert.equal(normalizeTrip({ background: 'url(http://x)' }).background, 'plain');
  assert.equal(normalizeTrip({}).background, 'plain');
});

test('背景の写真: 正しいJPEGだけ通り、共有用ファイルには入らない', () => {
  const ok = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const t = normalizeTrip({ id: 'p', background: 'photo', backgroundPhoto: ok });
  assert.equal(t.background, 'photo');
  assert.equal(t.backgroundPhoto, ok);
  // 写真が無い・不正なのに photo 指定 → plain に戻る
  assert.equal(normalizeTrip({ background: 'photo' }).background, 'plain');
  assert.equal(normalizeTrip({ background: 'photo', backgroundPhoto: 'data:text/html;base64,AAAA' }).background, 'plain');
  assert.equal(normalizeTrip({ background: 'photo', backgroundPhoto: 'url(javascript:1)' }).backgroundPhoto, '');
  assert.equal(normalizeTrip({ background: 'photo', backgroundPhoto: 'data:image/jpeg;base64,' + 'A'.repeat(800000) }).backgroundPhoto, '');
  // 共有用は写真を除く / バックアップには含む
  const shared = parseImport(serializeTrip(t, { share: true }))[0];
  assert.equal(shared.backgroundPhoto, '');
  assert.equal(shared.background, 'plain');
  assert.equal(parseImport(serializeTrip(t))[0].backgroundPhoto, ok);
});

test('場所の写真: 正しい小さなJPEGだけ通り、共有用には入らない', () => {
  const ok = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const t = normalizeTrip({ id: 'q', places: [{ id: 'a', name: 'x', photo: ok }, { id: 'b', name: 'y', photo: 'data:image/jpeg;base64,' + 'A'.repeat(250000) }, { id: 'c', name: 'z', photo: 'http://example.com/a.jpg' }] });
  assert.equal(t.places[0].photo, ok);
  assert.equal(t.places[1].photo, '');
  assert.equal(t.places[2].photo, '');
  assert.equal(parseImport(serializeTrip(t, { share: true }))[0].places[0].photo, '');
  assert.equal(parseImport(serializeTrip(t))[0].places[0].photo, ok);
});

test('予約: 正規化(日にち0=未定、範囲外や不正な時刻は落とす)と書き出し', () => {
  const t = normalizeTrip({ days: 2, bookings: [{ id: 'b1', title: '宿', day: 9, time: '25:00', memo: 'm', done: true }, { title: '', day: -3 }, 'x'] });
  assert.equal(t.bookings.length, 3);
  assert.equal(t.bookings[0].day, 2);
  assert.equal(t.bookings[0].time, '');
  assert.equal(t.bookings[0].done, true);
  assert.equal(t.bookings[1].day, 0);
  assert.equal(t.bookings[1].title, '(予約)');
  assert.equal(normalizeTrip({}).bookings.length, 0);
  assert.equal(parseImport(serializeTrip(t))[0].bookings.length, 3);
});

test('予定のマーク(emoji): 保存され、長すぎる値は切り詰める', () => {
  const t = normalizeTrip({ schedule: [{ id: 's', title: 'a', emoji: '🍣' }, { id: 't', title: 'b', emoji: 'x'.repeat(40) }, { id: 'u', title: 'c' }] });
  assert.equal(t.schedule[0].emoji, '🍣');
  assert.equal(Array.from(t.schedule[1].emoji).length, 8);
  assert.equal(t.schedule[2].emoji, '');
});
