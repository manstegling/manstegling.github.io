/** Energy Rush game simulation. Pure JavaScript; no browser dependencies. */
export const PERIODS = Object.freeze({
  night: { label: 'NIGHT', short: 'NIGHT', color: '#477ddc', lane: 0 },
  duty: { label: 'MUST WORK', short: 'WORK!', color: '#f35e76', lane: 0 },
  hazard: { label: 'OVERHEAT', short: 'HEAT', color: '#fb8c55', lane: 0 },
  quiet: { label: 'QUIET TIME', short: 'QUIET', color: '#7f82c6', lane: 0 },
  golden: { label: 'PAYDAY', short: '2× PAY', color: '#ffcc65', lane: 1 },
  focus: { label: 'FLOW', short: 'FLOW', color: '#65e0c3', lane: 1 },
});

export const POWERUPS = Object.freeze({
  coffee: { label: 'Second Wind', short: 'ENERGY', symbol: '+', cost: 6, description: 'Restore 30 energy instantly.' },
  payday: { label: 'Big Payday', short: 'PAYDAY', symbol: '$', cost: 7, description: 'Earn 1.8× dollars for 9 seconds.' },
  efficiency: { label: 'Easy Does It', short: 'SAVER', symbol: '◆', cost: 6, description: 'Spend 45% less energy for 9 seconds.' },
});

export const LEVELS = Object.freeze([
  {
    id: 'day', name: 'Day Shift', eyebrow: '01 / FIND YOUR RHYTHM', duration: 180,
    description: 'Reliable nights and scheduled duties. Master the rhythm of work and recovery.',
    nightStart: 9, nightEvery: 27, nightLength: 8.4, nightJitter: 0,
    dutyGap: 4.1, dutyLength: 2.65, dutyJitter: 0.15,
    goldenEvery: 23, hazardEvery: 62, quietEvery: 64, focusEvery: 46,
    pickupEvery: 26, randomSpread: 0.12, hazardScale: 1.40,
    challenges: [
      { id: 'bank', label: 'Earn $2,000', metric: 'bestBank', target: 2000 },
      { id: 'duties', label: 'Complete 5 mandatory shifts', metric: 'dutiesCompleted', target: 5 },
      { id: 'nights', label: 'Sleep through 4 entire nights', metric: 'nightsSlept', target: 4 },
    ],
  },
  {
    id: 'rush', name: 'Rush Hour', eyebrow: '02 / ADAPT ON THE FLY', duration: 240,
    description: 'Unpredictable hazards and tempting bonuses. Adapt quickly without burning out.',
    nightStart: 12, nightEvery: 29, nightLength: 7.4, nightJitter: 3.0,
    dutyGap: 3.5, dutyLength: 2.9, dutyJitter: 0.45,
    goldenEvery: 19, hazardEvery: 26, quietEvery: 47, focusEvery: 36,
    pickupEvery: 21, randomSpread: 0.27, hazardScale: 1.55,
    challenges: [
      { id: 'bank', label: 'Earn $3,500', metric: 'bestBank', target: 3500 },
      { id: 'pickups', label: 'Collect 5 powerups', metric: 'pickupsCollected', target: 5 },
      { id: 'steady', label: 'Finish without exhaustion', metric: 'cleanFinish', target: 1 },
    ],
  },
  {
    id: 'night', name: 'Night Owl', eyebrow: '03 / THE LONG SHIFT', duration: 300,
    description: 'Frequent nights, tougher work demands, and a full five-minute endurance test.',
    nightStart: 7, nightEvery: 21.6, nightLength: 7.5, nightJitter: 1.6,
    dutyGap: 3.6, dutyLength: 3.15, dutyJitter: 0.35,
    goldenEvery: 24, hazardEvery: 31, quietEvery: 49, focusEvery: 39,
    pickupEvery: 23, randomSpread: 0.18, hazardScale: 1.52,
    challenges: [
      { id: 'bank', label: 'Earn $4,500', metric: 'bestBank', target: 4500 },
      { id: 'nights', label: 'Sleep through 10 entire nights', metric: 'nightsSlept', target: 10 },
      { id: 'focus', label: 'Generate 25 focus', metric: 'focusGenerated', target: 25 },
    ],
  },
]);

export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const overlaps = (a, b, margin = 0) => a.start < b.end + margin && a.end > b.start - margin;

/** Generate a complete run upfront. Randomness is bounded to preserve meaningful opportunities. */
export function createSchedule(level, seed) {
  const random = seededRandom(seed);
  const range = (v) => (random() * 2 - 1) * v;
  const periods = [];
  const pickups = [];
  const horizon = 620; // Greater than maximum accelerated game duration.
  let nextId = 0;
  const add = (type, start, length) => {
    const p = { id: nextId++, type, start: Math.max(0, start), end: Math.max(0, start) + length };
    periods.push(p);
    return p;
  };
  const duties = [];
  const nights = [];
  let nightTime = level.nightStart;
  while (nightTime < horizon) {
    const night = add('night', nightTime, level.nightLength + range(0.4));
    nights.push(night);
    const duty = add('duty', night.end + level.dutyGap + range(level.dutyJitter), level.dutyLength + range(level.dutyJitter / 2));
    duties.push(duty);
    nightTime += level.nightEvery + range(level.nightJitter);
  }

  function scatter(type, every, length, offset, forbidden = []) {
    if (!every) return;
    let cursor = offset;
    while (cursor < horizon) {
      const len = length + range(0.7);
      let start = cursor + range(every * level.randomSpread);
      let candidate = { start, end: start + len };
      // Keep dangerous hazards out of required-work windows, and avoid directly contradictory bonuses.
      for (let i = 0; i < 12 && forbidden.some((p) => overlaps(candidate, p, 1.1)); i++) {
        start += 1.25;
        candidate = { start, end: start + len };
      }
      if (start > 1 && start < horizon && !forbidden.some((p) => overlaps(candidate, p, 0.3))) {
        add(type, start, len);
      }
      cursor += every;
    }
  }
  scatter('golden', level.goldenEvery, 4.6, 5, duties);
  scatter('hazard', level.hazardEvery, 3.8, 24, duties);
  scatter('quiet', level.quietEvery, 4.3, 38, duties.concat(periods.filter((p) => p.type === 'golden')));
  scatter('focus', level.focusEvery, 4.3, 18);

  // A shuffled bag balances the powerup variety without predetermining pickup timing.
  let bag = [];
  function drawPowerup() {
    if (!bag.length) {
      bag = Object.keys(POWERUPS);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }
  let pickupTime = 14;
  while (pickupTime < horizon) {
    let t = pickupTime + range(level.pickupEvery * level.randomSpread);
    // Put pickups in an actionable segment rather than inside a high-value recovery window.
    for (let i = 0; i < 12 && nights.some((p) => p.start + 0.7 < t && p.end - 0.7 > t); i++) t += 1.1;
    if (t < horizon) pickups.push({ id: nextId++, at: t, type: drawPowerup(), state: 'upcoming' });
    pickupTime += level.pickupEvery;
  }
  periods.sort((a, b) => a.start - b.start);
  pickups.sort((a, b) => a.at - b.at);
  return { periods, pickups };
}

export class EnergyRushGame {
  constructor(level, seed) {
    this.level = level;
    this.seed = seed >>> 0;
    const schedule = createSchedule(level, seed);
    this.periods = schedule.periods;
    this.pickups = schedule.pickups;
    this.status = 'running';
    this.endReason = '';
    this.realTime = 0;
    this.clock = 0;
    this.energy = 100;
    this.bank = 0;
    this.highWaterBank = 0;
    this.totalEarned = 0;
    this.stage = 1;
    this.focus = 0;
    this.focusFraction = 0;
    this.workHeld = false;
    this.holdSeconds = 0;
    this.dutyMissingSeconds = 0;
    this.inventory = null;
    this.activeEffect = null;
    this.sleptNights = new Set();
    this.completedDuties = new Set();
    this.metrics = {
      bestBank: 0, dutiesCompleted: 0, nightsSlept: 0, pickupsCollected: 0,
      focusGenerated: 0, exhausted: false, cleanFinish: 0,
    };
    this.challengeDone = new Set();
    this.notifications = [];
    this.latestEvent = '';
  }

  get speed() { return 1 + 0.13 * (this.stage - 1); }
  get remaining() { return Math.max(0, this.level.duration - this.realTime); }
  get working() { return this.status === 'running' && this.workHeld; }
  get activePeriods() {
    return this.periods.filter((p) => p.start <= this.clock && p.end > this.clock);
  }
  isActive(type) { return this.periods.some((p) => p.type === type && p.start <= this.clock && p.end > this.clock); }
  get currentDuty() { return this.periods.find((p) => p.type === 'duty' && p.start <= this.clock && p.end > this.clock); }

  notify(message, kind = 'info') {
    this.notifications.push({ message, kind, at: this.realTime });
  }
  awardFocus(amount) {
    if (amount <= 0) return;
    this.metrics.focusGenerated += amount;
    this.focus = clamp(this.focus + amount, 0, 30);
  }
  checkChallenges() {
    for (const challenge of this.level.challenges) {
      if (this.challengeDone.has(challenge.id)) continue;
      if (this.metrics[challenge.metric] >= challenge.target) {
        this.challengeDone.add(challenge.id);
        this.notify(`Mission complete: ${challenge.label}`, 'success');
      }
    }
  }

  activatePowerup() {
    if (this.status !== 'running') return { ok: false, message: 'Game not running' };
    if (!this.inventory) return { ok: false, message: 'Collect a powerup first' };
    const type = this.inventory;
    const powerup = POWERUPS[type];
    if (this.focus < powerup.cost) return { ok: false, message: `Need ${powerup.cost} focus` };
    this.focus -= powerup.cost;
    this.inventory = null;
    if (type === 'coffee') {
      this.energy = clamp(this.energy + 30, 0, 100);
    } else {
      this.activeEffect = { type, remaining: 9 };
    }
    this.notify(`${powerup.label} activated!`, 'success');
    return { ok: true, type };
  }

  finish(reason) {
    if (this.status === 'ended') return;
    this.status = 'ended';
    this.endReason = reason;
    this.workHeld = false;
    if (reason === 'Time complete' && !this.metrics.exhausted) this.metrics.cleanFinish = 1;
    this.checkChallenges();
  }

  /** Time is always real wall-clock seconds. Events use an accelerating world clock. */
  update(dt) {
    if (this.status !== 'running') return;
    dt = clamp(dt, 0, 0.05);
    if (dt === 0) return;
    const previousClock = this.clock;
    const nextClock = previousClock + dt * this.speed;
    this.realTime += dt;
    this.clock = nextClock;

    const working = this.workHeld;
    const mid = (previousClock + nextClock) / 2;
    const active = (type) => this.periods.some((p) => p.type === type && p.start <= mid && p.end > mid);
    if (working) {
      this.holdSeconds += dt;
      const fatigue = 1 + Math.min(0.58, Math.max(0, this.holdSeconds - 2) * 0.09);
      const savings = this.activeEffect?.type === 'efficiency' ? 0.55 : 1;
      const drain = 10.6 * (1 + 0.045 * (this.stage - 1)) * fatigue * (active('hazard') ? this.level.hazardScale : 1) * savings;
      this.energy = Math.max(0, this.energy - drain * dt);
      let income = 32 * (1 + 0.24 * (this.stage - 1));
      if (active('golden')) income *= 2;
      if (active('quiet')) income *= 0.55;
      if (this.activeEffect?.type === 'payday') income *= 1.8;
      const earn = income * dt;
      this.bank += earn;
      const previousHundreds = Math.floor(this.totalEarned / 100 + 1e-9);
      this.totalEarned += earn;
      this.awardFocus(Math.floor(this.totalEarned / 100 + 1e-9) - previousHundreds);
      const priorStreaks = Math.floor((this.holdSeconds - dt + 1e-7) / 5);
      const currentStreaks = Math.floor((this.holdSeconds + 1e-7) / 5);
      if (currentStreaks > priorStreaks) {
        this.awardFocus(currentStreaks - priorStreaks);
        this.notify('+1 focus · work streak', 'focus');
      }
      if (active('focus')) {
        this.focusFraction += 0.6 * dt;
        if (this.focusFraction >= 1) {
          const gain = Math.floor(this.focusFraction);
          this.focusFraction -= gain;
          this.awardFocus(gain);
        }
      }
    } else {
      this.holdSeconds = 0;
      const recovery = this.energy < 20 ? 3.6 : 8.8 * (1 - 0.32 * this.energy / 100);
      const multiplier = (active('night') ? 2.35 : 1) * (active('quiet') ? 1.45 : 1);
      this.energy = Math.min(100, this.energy + recovery * multiplier * dt);
    }
    if (this.energy < 20) this.metrics.exhausted = true;
    this.bank = Math.max(0, this.bank - (1.2 + 0.16 * (this.stage - 1)) * dt);
    this.highWaterBank = Math.max(this.highWaterBank, this.bank);
    this.metrics.bestBank = this.highWaterBank;
    const nextStage = Math.min(7, 1 + Math.floor((this.highWaterBank + 1e-8) / 1000));
    if (nextStage > this.stage) {
      this.stage = nextStage;
      this.notify(`Stage ${this.stage} · faster tempo, bigger pay!`, 'stage');
    }

    // Pickup at the precise time its icon crosses the NOW marker.
    for (const pickup of this.pickups) {
      if (pickup.state === 'upcoming' && pickup.at > previousClock && pickup.at <= nextClock) {
        if (working && !this.inventory) {
          this.inventory = pickup.type;
          pickup.state = 'collected';
          this.metrics.pickupsCollected++;
          this.notify(`${POWERUPS[pickup.type].label} collected`, 'pickup');
        } else {
          pickup.state = 'missed';
        }
      }
    }

    // Entire night must be spent resting to count as a night slept.
    for (const night of this.periods) {
      if (night.type !== 'night' || night.end < previousClock - 0.01 || night.start > nextClock) continue;
      if (working && nextClock > night.start && previousClock < night.end) night.interrupted = true;
      if (previousClock < night.end && nextClock >= night.end && !night.interrupted) {
        this.sleptNights.add(night.id);
        this.metrics.nightsSlept = this.sleptNights.size;
      }
    }

    // Duty requires sustained button holding; a short grace period covers human reaction/input jitter.
    const duty = this.periods.find((p) => p.type === 'duty' && p.start < nextClock && p.end > previousClock);
    if (duty) {
      if (working) this.dutyMissingSeconds = 0;
      else {
        const overlapWorld = Math.max(0, Math.min(nextClock, duty.end) - Math.max(previousClock, duty.start));
        this.dutyMissingSeconds += overlapWorld / this.speed;
      }
      if (this.dutyMissingSeconds >= 0.24) {
        this.finish('Missed mandatory work');
        return;
      }
      if (previousClock < duty.end && nextClock >= duty.end) {
        this.completedDuties.add(duty.id);
        this.metrics.dutiesCompleted = this.completedDuties.size;
        this.notify('Mandatory shift cleared', 'success');
        this.dutyMissingSeconds = 0;
      }
    } else this.dutyMissingSeconds = 0;

    if (this.activeEffect) {
      this.activeEffect.remaining -= dt;
      if (this.activeEffect.remaining <= 0) this.activeEffect = null;
    }
    if (this.energy <= 0) {
      this.finish('Energy depleted');
      return;
    }
    if (this.realTime >= this.level.duration) {
      this.realTime = this.level.duration;
      this.finish('Time complete');
      return;
    }
    this.checkChallenges();
  }
}
