import assert from 'node:assert/strict';
import test from 'node:test';
import { washerConfig } from '../src/config.mjs';
import { Washer } from '../src/washer.mjs';

const defaults = { lidClosed: true, waterLevel: 'empty' };
const off = { fill: false, agitate: false, drain: false };

function makeRun() {
  const washer = new Washer();
  return (time, inputs) => washer.update(time, { ...defaults, ...inputs });
}

test('completes a wash and rinse cycle with one output at a time', () => {
  const update = makeRun();
  const washEnd = 1_000 + washerConfig.washMs;
  const rinseEnd = washEnd + 2_000 + washerConfig.rinseMs;
  const steps = [
    [0, { start: true }, 'fill', 'fill'],
    [500, { waterLevel: 'between' }, 'fill', 'fill'],
    [1_000, { waterLevel: 'target' }, 'wash', 'agitate'],
    [washEnd, { waterLevel: 'target' }, 'drain', 'drain'],
    [washEnd + 1_000, {}, 'rinse-fill', 'fill'],
    [washEnd + 2_000, { waterLevel: 'target' }, 'rinse', 'agitate'],
    [rinseEnd, { waterLevel: 'target' }, 'final-drain', 'drain'],
    [rinseEnd + 1_000, {}, 'complete', null],
  ];

  for (const [time, inputs, state, output] of steps) {
    const expectedOutputs = { ...off };
    if (output) expectedOutputs[output] = true;
    assert.deepEqual(update(time, inputs), { state, reason: null, outputs: expectedOutputs });
  }
});

test('opening the lid stops agitation and requires a reset and fresh start', () => {
  const update = makeRun();
  update(0, { start: true });
  update(1_000, { waterLevel: 'target' });
  assert.deepEqual(update(1_001, { lidClosed: false, waterLevel: 'target' }), {
    state: 'fault', reason: 'lid-open', outputs: off,
  });
  assert.equal(update(2_000, { start: true }).state, 'fault');
  assert.equal(update(3_000, { start: true, reset: true }).state, 'idle');
  assert.equal(update(4_000, { start: true }).state, 'idle');
  update(5_000, {});
  assert.equal(update(6_000, { start: true, waterLevel: 'between' }).state, 'pre-drain');
  assert.equal(update(7_000, {}).state, 'fill');
});

test('stop overrides an input that would otherwise start agitation', () => {
  const update = makeRun();
  update(0, { start: true });
  assert.deepEqual(update(1_000, { stop: true, waterLevel: 'target' }), {
    state: 'stopped', reason: 'stop-pressed', outputs: off,
  });
});

test('fill and drain timeouts turn off all outputs', () => {
  const fill = makeRun();
  fill(0, { start: true });
  assert.deepEqual(fill(washerConfig.fillTimeoutMs, {}), {
    state: 'fault', reason: 'fill-timeout', outputs: off,
  });

  const drain = makeRun();
  drain(0, { start: true, waterLevel: 'target' });
  assert.deepEqual(drain(washerConfig.drainTimeoutMs, { waterLevel: 'between' }), {
    state: 'fault', reason: 'drain-timeout', outputs: off,
  });
});

test('invalid water readings and low water during agitation stop the cycle', () => {
  const fill = makeRun();
  fill(0, { start: true });
  assert.deepEqual(fill(1_000, { waterLevel: 'invalid' }), {
    state: 'fault', reason: 'invalid-water-level', outputs: off,
  });

  const wash = makeRun();
  wash(0, { start: true });
  wash(1_000, { waterLevel: 'target' });
  assert.deepEqual(wash(2_000, {}), {
    state: 'fault', reason: 'low-water', outputs: off,
  });
});
