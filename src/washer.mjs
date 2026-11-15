import { washerConfig } from './config.mjs';

const activeStates = new Set([
  'pre-drain', 'fill', 'wash', 'drain', 'rinse-fill', 'rinse', 'final-drain',
]);
const waterLevels = new Set(['empty', 'between', 'target']);

export class Washer {
  #config;
  #state = 'idle';
  #stateSince = 0;
  #reason = null;
  #startHeld = false;

  constructor(config = washerConfig) {
    this.#config = config;
  }

  update(nowMs, inputs) {
    const startPressed = inputs.start === true && !this.#startHeld;
    this.#startHeld = inputs.start === true;
    const validWaterLevel = waterLevels.has(inputs.waterLevel);

    if (activeStates.has(this.#state)) {
      if (inputs.stop === true) {
        this.#enter('stopped', nowMs, 'stop-pressed');
      } else if (inputs.lidClosed !== true) {
        this.#enter('fault', nowMs, 'lid-open');
      } else if (!validWaterLevel) {
        this.#enter('fault', nowMs, 'invalid-water-level');
      } else {
        this.#advance(nowMs, inputs.waterLevel);
      }
    } else if (inputs.lidClosed === true && inputs.stop !== true && validWaterLevel) {
      if (inputs.reset === true) {
        this.#enter('idle', nowMs);
      } else if (startPressed && (this.#state === 'idle' || this.#state === 'complete')) {
        this.#enter(inputs.waterLevel === 'empty' ? 'fill' : 'pre-drain', nowMs);
      }
    }

    return {
      state: this.#state,
      reason: this.#reason,
      outputs: {
        fill: this.#state === 'fill' || this.#state === 'rinse-fill',
        agitate: this.#state === 'wash' || this.#state === 'rinse',
        drain: this.#state === 'pre-drain' || this.#state === 'drain' || this.#state === 'final-drain',
      },
    };
  }

  #enter(state, nowMs, reason = null) {
    this.#state = state;
    this.#stateSince = nowMs;
    this.#reason = reason;
  }

  #advance(nowMs, waterLevel) {
    const elapsed = nowMs - this.#stateSince;
    const config = this.#config;

    switch (this.#state) {
      case 'fill':
      case 'rinse-fill':
        if (waterLevel === 'target') {
          this.#enter(this.#state === 'fill' ? 'wash' : 'rinse', nowMs);
        } else if (elapsed >= config.fillTimeoutMs) {
          this.#enter('fault', nowMs, 'fill-timeout');
        }
        break;
      case 'wash':
      case 'rinse': {
        const washing = this.#state === 'wash';
        if (waterLevel === 'empty') {
          this.#enter('fault', nowMs, 'low-water');
        } else if (elapsed >= (washing ? config.washMs : config.rinseMs)) {
          this.#enter(washing ? 'drain' : 'final-drain', nowMs);
        }
        break;
      }
      case 'pre-drain':
      case 'drain':
      case 'final-drain':
        if (waterLevel === 'empty') {
          const nextState = {
            'pre-drain': 'fill',
            drain: 'rinse-fill',
            'final-drain': 'complete',
          }[this.#state];
          this.#enter(nextState, nowMs);
        } else if (elapsed >= config.drainTimeoutMs) {
          this.#enter('fault', nowMs, 'drain-timeout');
        }
        break;
    }
  }
}
