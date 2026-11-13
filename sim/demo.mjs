import { Washer } from '../src/washer.mjs';

const washer = new Washer();
const targetLevel = 3;
let level = 0;
let previousState;
let outputs = {};

for (let seconds = 0; seconds <= 60; seconds += 1) {
  if (outputs.fill) level = Math.min(targetLevel, level + 1);
  if (outputs.drain) level = Math.max(0, level - 1);

  const waterLevel = level === 0 ? 'empty' : level === targetLevel ? 'target' : 'between';
  const snapshot = washer.update(seconds * 1_000, {
    start: seconds === 0,
    lidClosed: true,
    waterLevel,
  });
  outputs = snapshot.outputs;

  if (snapshot.state !== previousState) {
    const activeOutput = Object.keys(outputs).find((output) => outputs[output]);
    console.log(`${seconds}s  ${snapshot.state}  water=${waterLevel}  output=${activeOutput ?? 'off'}`);
    previousState = snapshot.state;
  }
  if (snapshot.state === 'complete') break;
}

if (previousState !== 'complete') process.exitCode = 1;
