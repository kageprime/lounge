// Life Simulation Engine.
// Pure deterministic simulation module: no DOM, no Three.js.
// Manages the in-game clock, day-night cycles, player vibes (Energy, Hunger, Fun, Social),
// gigs and daily life events.

export const TIME_BANDS = [
  { id: 'dawn', label: 'Dawn', start: 5, end: 9, sunColor: 0xffd1a4, skyColor: 0x3d315b, light: 1.1 },
  { id: 'day', label: 'Day', start: 9, end: 17, sunColor: 0xffe2c0, skyColor: 0x221a40, light: 1.7 },
  { id: 'sunset', label: 'Sunset', start: 17, end: 21, sunColor: 0xff7b54, skyColor: 0x301540, light: 1.3 },
  { id: 'night', label: 'Night', start: 21, end: 26, sunColor: 0x4d5b9e, skyColor: 0x0c0a16, light: 0.6 }, // 21 to 02:00
  { id: 'twilight', label: 'Twilight', start: 2, end: 5, sunColor: 0x6b2b8a, skyColor: 0x140520, light: 0.8 } // 02:00 to 05:00
];

export const GIGS = [
  {
    id: 'diner_shift',
    title: 'Diner Barista Shift',
    desc: 'Serve espresso & ramen at Neon Diner.',
    rewardCoins: 45,
    rewardTickets: 15,
    reqTarget: 'din_counter'
  },
  {
    id: 'arcade_tech',
    title: 'Arcade Maintenance',
    desc: 'Inspect and calibrate arcade controls.',
    rewardCoins: 50,
    rewardTickets: 25,
    reqTarget: 'arc_cab_3'
  },
  {
    id: 'bodega_stock',
    title: 'Bodega Inventory Check',
    desc: 'Stock beverage coolers at Night Owl Mart.',
    rewardCoins: 35,
    rewardTickets: 10,
    reqTarget: 'bod_cool1'
  }
];

export class LifeSim {
  constructor(options = {}) {
    this.speed = options.speed ?? 1.0; // 1 real sec = 1 in-game minute
    this.minute = options.startMinute ?? 30;
    this.hour = options.startHour ?? 12; // Start at 12:30 PM (broad daylight)
    this.day = 1;
    this.t = 0;

    // Player Vibe Meters (0 to 100)
    this.vibes = {
      energy: 85,
      hunger: 75,
      fun: 80,
      social: 60
    };

    // Active gig if any
    this.activeGig = null;
    this.completedGigs = new Set();
  }

  step(dt) {
    this.t += dt;
    // Advance clock: dt in seconds * speed = game minutes
    this.minute += dt * this.speed;
    while (this.minute >= 60) {
      this.minute -= 60;
      this.hour++;
      if (this.hour >= 24) {
        this.hour = 0;
        this.day++;
      }
    }

    // Passive Vibe Decay (gentle: ~10 points per game hour)
    const decayRate = (dt * this.speed / 60) * 8;
    this.vibes.energy = Math.max(10, this.vibes.energy - decayRate * 0.9);
    this.vibes.hunger = Math.max(5, this.vibes.hunger - decayRate * 1.1);
    this.vibes.fun = Math.max(10, this.vibes.fun - decayRate * 1.0);
    this.vibes.social = Math.max(10, this.vibes.social - decayRate * 0.8);
  }

  getTimeBand() {
    const h = this.hour;
    if (h >= 5 && h < 9) return TIME_BANDS[0];     // dawn
    if (h >= 9 && h < 17) return TIME_BANDS[1];    // day
    if (h >= 17 && h < 21) return TIME_BANDS[2];   // sunset
    if (h >= 21 || h < 2) return TIME_BANDS[3];    // night
    return TIME_BANDS[4];                          // twilight (02:00 - 05:00)
  }

  isTwilightHour() {
    return this.hour >= 2 && this.hour < 5;
  }

  getClockString() {
    const hh = String(this.hour).padStart(2, '0');
    const mm = String(Math.floor(this.minute)).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // Calculate flow state / vibe boost
  getVibeScore() {
    return (this.vibes.energy + this.vibes.hunger + this.vibes.fun + this.vibes.social) / 4;
  }

  hasVibeBoost() {
    return this.getVibeScore() >= 80;
  }

  // Life-Sim Actions on Props
  interact(action, propType, propId) {
    const res = { success: true, text: '', coins: 0, tickets: 0 };
    switch (action) {
      case 'food':
        this.vibes.hunger = Math.min(100, this.vibes.hunger + 45);
        this.vibes.energy = Math.min(100, this.vibes.energy + 15);
        res.text = 'Enjoyed a hearty meal (+45 Hunger, +15 Energy)';
        break;
      case 'drink':
        this.vibes.hunger = Math.min(100, this.vibes.hunger + 20);
        this.vibes.energy = Math.min(100, this.vibes.energy + 35);
        res.text = 'Savoured a refreshing drink (+35 Energy, +20 Hunger)';
        break;
      case 'sleep':
        this.vibes.energy = 100;
        if (propId === 'loft_bed1') {
          this.hour = 7;
          this.minute = 0;
          this.vibes.hunger = Math.max(30, this.vibes.hunger - 25);
          res.morning = true;
          res.text = '✦ Slept overnight in Unit 101 until 07:00 AM (Dawn). Energy fully restored!';
        } else {
          res.text = 'Rested comfortably in bed (Energy fully restored!)';
        }
        break;
      case 'play':
        this.vibes.fun = Math.min(100, this.vibes.fun + 35);
        this.vibes.social = Math.min(100, this.vibes.social + 10);
        res.text = 'Had a blast playing (+35 Fun)';
        break;
      case 'scavenge':
        if (Math.random() < 0.6) {
          const c = 5 + Math.floor(Math.random() * 10);
          res.coins = c;
          res.text = `Scavenged recyclable parts (+${c} Coins)`;
        } else {
          res.text = 'Searched the bin, but found only empty cans.';
        }
        break;
      default:
        res.success = false;
        break;
    }

    // Check active gig progression
    if (this.activeGig && this.activeGig.reqTarget === propId) {
      res.coins += this.activeGig.rewardCoins;
      res.tickets += this.activeGig.rewardTickets;
      res.text += ` · Gig Complete: ${this.activeGig.title} (+${this.activeGig.rewardCoins}🪙, +${this.activeGig.rewardTickets}🎟️)`;
      this.completedGigs.add(this.activeGig.id);
      this.activeGig = null;
    }

    return res;
  }

  socialize(affinityGain = 15) {
    this.vibes.social = Math.min(100, this.vibes.social + affinityGain);
    this.vibes.fun = Math.min(100, this.vibes.fun + 10);
  }
}
