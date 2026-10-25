// =============================================================================
// Last-Hit-Modus
// Minion-Wellen, Türme und Champion nach LoL-Werten in echten Proportionen.
// Alles mit "Schätzung" stammt nicht aus offiziellen Quellen und lässt sich hier
// anpassen. Quellen der übrigen Werte: LoL-Wiki (Minions, Türme), Data Dragon
// (Champion-Werte), eigene Rechnung (Maßstab, Laufweg, Perfekt-Wert).
// =============================================================================

const LH = {
  UNIT: 0.1636, // Welt-px pro LoL-Einheit (Abstand der äußeren Mid-Türme: 3760 Einheiten)
  CLOCK_START: 45, // Uhr startet bei 0:45, kurz bevor die erste Welle den Turm erreicht
  MAX_WAVES: 18, // höchste einstellbare Wellenzahl (18 Wellen = etwa die ersten 10 Minuten)
  DEFAULT_WAVES: 18,
  END_GRACE: 120, // Sicherheitsgrenze: spätestens so lange nach Ankunft der letzten Welle endet der Run
  FIRST_SPAWN: 30, // erste Welle am Nexus bei 0:30 (seit Patch 26.1, vorher 1:05)
  WAVE_INTERVAL: 30, // danach alle 30 Sekunden
  UPGRADE_INTERVAL: 90, // Minions werden alle 90 Sekunden stärker
  SPAWN_GAP: 0.792, // Abstand der Minions innerhalb einer Welle
  NEXUS_TO_TURRET: 8370, // Laufweg Nexus -> äußerer Mid-Turm in Einheiten (berechnet)
  MINION_SPEED: 350, // Grund-Lauftempo der Minions bis Minute 11 (seit Patch 26.1, vorher 325)
  ACQUISITION: 500, // Minions suchen Ziele in diesem Umkreis
  XP_RANGE: 1500, // Erfahrung gibt es nur in diesem Umkreis
  DAMAGE_TO_CHAMPIONS: 0.55, // Minions machen 55 % Schaden gegen Champions
  FIRST_WAVE_GHOST: 0, // in LoL ist die erste Mid-Welle 18 s "ghosted"; hier aus, damit nie Minions ineinander stehen
  SEPARATION_PASSES: 4, // so oft pro Frame werden Überlappungen aufgelöst
  RETARGET_TIME: 1.2, // Ziel wird zwischen Angriffen neu geprüft (Schätzung: "alle paar Sekunden")
  // Angriffsanimation, Projektiltempo und Radius kommen aus champion-attack-data.js (LoL-Wiki).
  // Die folgenden Werte gelten nur, wenn ein Champion dort fehlt oder keine Angabe hat.
  CHAMPION_RADIUS: 65, // Standard-Kollisionsradius
  WINDUP_SHARE: 0.3, // Wiki-Standard für die Angriffsanimation
  PROJECTILE_SPEED: { Marksman: 2500, default: 1800 }, // Schätzung für Sonderfälle (z. B. Jinx, Zeri)
  MELEE_RANGE_LIMIT: 300,
  CLICK_TOLERANCE: 8, // so viele Welt-px neben einem Minion zählt ein Klick noch als Angriff
  // Erfahrung bis zum nächsten Level (aus meinem Wissen, nicht live geprüft)
  XP_TO_LEVEL: [280, 380, 480, 580, 680, 780, 880, 980, 1080, 1180, 1280, 1380, 1480, 1580, 1680, 1780, 1880],
};

// Werte der Minions; "u" = Anzahl Upgrades (die erste Welle hat bereits 1)
// Angriffsschaden und Rüstung von Melee und Caster: Spanne aus dem Wiki,
// dazwischen linear verteilt (Schätzung). Angriffsanimationen: Schätzung.
const MINION_TYPES = {
  melee: {
    radius: 48, range: 110, attackSpeed: 1.25, windup: 0.2, missile: 0,
    hp: (u) => Math.min(1550, 430 + 35 * u),
    ad: (u) => Math.min(80, 11 + (69 * (u - 1)) / 24),
    armor: (u) => Math.min(20, (20 * (u - 1)) / 24),
    vsMinion: 0.02, xp: 62, turretShare: 0.45,
  },
  caster: {
    radius: 48, range: 550, attackSpeed: 0.667, windup: 0.3, missile: 650,
    hp: (u) => Math.min(600, 275 + 9 * u),
    ad: (u) => Math.min(125, 21 + (104 * (u - 1)) / 24),
    armor: () => 0,
    vsMinion: 0.035, xp: 31, turretShare: 0.7,
  },
  siege: {
    radius: 65, range: 300, attackSpeed: 1.0, windup: 0.3, missile: 1200, // Radius: Schätzung
    hp: (u) => Math.min(5850, 750 + 85 * u),
    ad: (u) => Math.min(126, 36 + 1.5 * u),
    armor: () => 0,
    vsMinion: 0.05, xp: 75, turretShare: 0.14, // Bonus gegen Minions 5 % seit Patch 26.9
  },
};

// Äußere Türme (Schaden gegen Champions und Aufheizen aus älteren Quellen)
const TURRET = {
  radius: 88.4, range: 750, attackSpeed: 0.83, missile: 1200,
  adStart: 152, adPerMinute: 4, adMax: 180, heatStep: 0.5, heatMax: 1.5, // Aufheizen: +50 % pro Treffer, bis +150 % (aktuelle Wiki-Angabe)
  minionPriority: { siege: 0, melee: 1, caster: 2 },
};

// Laufweg der Minions (aus deiner Vorlage, Karten-Pixel) und Turm-Positionen
const LH_MAP_X = 1.5;
const LH_MAP_Y = 800 / 533;
const LH_LANE_MAP = [[146, 362], [159, 354], [167, 343], [187, 326], [276, 269], [324, 243], [439, 149], [473, 111]];
const LH_TURRET_MAP = { blue: [135, 336], red: [490, 131] };

const LH_PATH = LH_LANE_MAP.map(([x, y]) => ({ x: x * LH_MAP_X, y: y * LH_MAP_Y }));
const LH_PATH_REV = [...LH_PATH].reverse();

const LH_COLORS = {
  blue: { body: '#3b82f6', light: '#93c5fd', bar: '#60a5fa' },
  red: { body: '#ef4444', light: '#fca5a5', bar: '#f87171' },
};

// -----------------------------------------------------------------------------
// Passiven, die Auto-Angriffe verstärken (Schlüssel = Champion-ID aus Data Dragon)
//
// statMods(level)               -> dauerhafte Werte: { bonusAdPercent, bonusAsPercent }
// onAttack(state, target, level) wird beim Abfeuern aufgerufen und liefert z. B.:
//   physical / magic / true     Bonusschaden dieses Angriffs
//   critMultiplier              Multiplikator für den Angriffsschaden (kritischer Treffer)
//   missingHealthPhysical       Anteil des fehlenden Lebens als physischer Bonus (beim Einschlag)
//   cleave: { radius, magic }   Flächenschaden um das Ziel (in LoL-Einheiten)
//   secondShot: { delay, adRatio } zusätzlicher Schuss nach kurzer Verzögerung
//   cooldownOverride            Mindestzeit bis zum nächsten Angriff (z. B. Nachladen)
//   missingHealthMagic          Anteil des fehlenden Lebens als magischer Bonus (beim Einschlag)
//   onHit(target)               Effekt beim Einschlag, z. B. Gift auftragen
//   adMagicShare                Anteil des Angriffsschadens, der magisch statt physisch ist
//   secondShot.retarget         zweiter Schlag trifft einen Minion in der Nähe, wenn das Ziel schon tot ist
//   dot: { total, duration, interval } echter Schaden über Zeit in gleichmäßigen Ticks (Gangplank)
//   impactMagic(target)         magischer Bonus, der vom Zustand des Ziels beim Einschlag abhängt (Gwen)
//   heal                        Heilung der Figur, wenn der Angriff trifft (Xin Zhao)
// attackTimeScale(state)        optional: Faktor für Angriffszeit und Animation des nächsten Angriffs (Sett)
//   impactPhysical(target)      physischer Bonus, der vom Zustand des Ziels beim Einschlag abhängt (Jarvan IV)
//   cleave.physical / .cone     Flächenschaden auch physisch, optional nur in einem Kegel (Nocturne, Urgot)
//   extraHits: [{ delay, magic }] zeitversetzte Zusatztreffer auf das Ziel (Lulus Pix)
// rangeBonus(state)             optional: zusätzliche Reichweite für den nächsten Angriff (Poppy)
// attackSpeedBonus(state)       optional: zusätzliches Bonus-Angriffstempo in Prozent (Kayle)
// statMods(level).range         optional: Angriffsreichweite ab einem Level (Kayle)
// onUpdate(state, dt)           optional: wird jeden Frame aufgerufen (Naafiris Rudel, Quinns Valor)
// onMinionDeath(state, minion)  optional: beim Tod eines gegnerischen Minions (Bel'Veth)
//   executeBelow                Ziel stirbt, wenn sein Leben nach dem Treffer darunter liegt (Zeri)
//   chain: { magic, range, jumps } Blitz springt zu weiteren Minions (Volibear)
//   splashHits: [{ unit, physical }] zusätzliche Treffer an anderen Minions (Graves' Schrotkugeln)
//   behindPhysical              physischer Bonus, wenn die Figur hinter dem Ziel steht (Shaco)
// Hinweis: Seiten wie RiftPatchNotes und OP.GG rechnen "je nach Level" bis Level 20 hoch;
// hier gelten die Werte auf Level 18, pro Level steigen beide gleich stark.
// Ohne Items und Fähigkeiten zählt nur der Level (AP = 0). Werte aus den aktuellen
// Daten-Vorlagen des LoL-Wikis. "Linear" = zwischen Level 1 und 18 gleichmäßig
// verteilt (exakt auf Level 1 und 18, dazwischen angenähert).
// -----------------------------------------------------------------------------
function lhLinear(min, max, level) {
  return min + ((max - min) * (level - 1)) / 17;
}

// Exakte Werte pro Level aus Riots Spieldaten (CommunityDragon), Index 0 = Level 1
function lhByLevel(values, level) {
  return values[Math.max(0, Math.min(values.length - 1, level - 1))];
}

// Stufenwerte: thresholds = Level, ab denen der jeweilige Wert gilt
function lhBracket(values, thresholds, level) {
  let value = values[0];
  thresholds.forEach((threshold, index) => {
    if (level >= threshold) value = values[index];
  });
  return value;
}

// Stapel auf demselben Ziel: zählt Treffer, liefert true, wenn "count" erreicht ist
function lhTargetStacks(state, target, duration, count) {
  const active = state.target === target && lh.time < state.expires;
  const stacks = (active ? state.stacks : 0) + 1;
  state.target = target;
  state.expires = lh.time + duration;
  if (stacks >= count) {
    state.stacks = 0;
    return true;
  }
  state.stacks = stacks;
  return false;
}

const LH_PASSIVES = {
  Orianna: {
    name: 'Clockwork Windup',
    summary: 'Auto-Angriffe machen 10 bis 50 magischen Bonusschaden (je nach Level), +15 % pro Stapel auf dasselbe Ziel, bis zu 2 Stapel für 4 Sekunden.',
    onAttack(state, target, level) {
      const base = lhLinear(10, 50, level); // 50 auf Level 18 (54,71 wäre der Wert auf Level 20)
      const active = state.target === target && lh.time < state.expires;
      const stacks = active ? state.stacks : 0;
      state.target = target;
      state.stacks = Math.min(2, stacks + 1);
      state.expires = lh.time + 4;
      return { magic: base * (1 + 0.15 * stacks) };
    },
  },

  Ziggs: {
    name: 'Short Fuse',
    summary: 'Alle 12 Sekunden macht der nächste Auto-Angriff 20 bis 160 magischen Bonusschaden (in Stufen je nach Level).',
    onAttack(state, target, level) {
      if (lh.time < (state.readyAt || 0)) return {};
      state.readyAt = lh.time + 12;
      const ziggsDamage = [20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 100, 112, 124, 136, 148, 160]; // Spieldaten
      return { magic: lhByLevel(ziggsDamage, level) };
    },
  },

  Diana: {
    name: 'Moonsilver Blade',
    summary: '15 bis 35 % Bonus-Angriffstempo. Jeder dritte Angriff innerhalb von 5 Sekunden trifft zusätzlich Gegner in der Nähe mit 20 bis 220 magischem Schaden.',
    statMods(level) {
      return { bonusAsPercent: lhLinear(15, 35, level) };
    },
    onAttack(state, target, level) {
      // Stapel sind nicht an ein Ziel gebunden
      const stacks = lh.time < (state.expires || 0) ? state.stacks || 0 : 0;
      state.expires = lh.time + 5;
      if (stacks >= 2) {
        state.stacks = 0;
        // Radius nicht offiziell angegeben: Schätzung 300 Einheiten, das Ziel selbst wird mitgetroffen
        const dianaCleave = [20, 25, 30, 35, 40, 45, 55, 65, 75, 85, 95, 110, 125, 140, 155, 170, 195, 220]; // Spieldaten
        return { cleave: { radius: 300, magic: lhByLevel(dianaCleave, level) } }; // Radius: Schätzung (nicht in den Spieldaten)
      }
      state.stacks = stacks + 1;
      return {};
    },
  },

  Akshan: {
    name: 'Dirty Fighting',
    summary: 'Jeder Auto-Angriff feuert kurz danach einen zweiten Schuss mit 100 % AD gegen Minions. Jeder dritte Treffer auf dasselbe Ziel (4,5 Sekunden) macht 15 / 40 / 80 / 150 magischen Bonusschaden.',
    onAttack(state, target, level) {
      const result = { secondShot: { delay: 0.15, adRatio: 1 } }; // Verzögerung: Schätzung
      if (lhTargetStacks(state, target, 4.5, 3)) { // Stapeldauer 4,5 s (Spieldaten)
        result.magic = lhBracket([15, 40, 80, 150], [1, 6, 11, 16], level); // Stufen laut Spieldaten bestätigt
      }
      return result;
    },
  },

  Ekko: {
    name: 'Z-Drive Resonance',
    summary: 'Jeder dritte Treffer auf dasselbe Ziel innerhalb von 4 Sekunden macht 30 bis 140 magischen Bonusschaden (je nach Level). Danach ist dasselbe Ziel 4 Sekunden gesperrt.',
    onAttack(state, target, level) {
      if (lh.time < (target.lhEkkoLockUntil || 0)) return {}; // Sperre nach dem Auslösen (LockoutTime 4 s)
      if (!lhTargetStacks(state, target, 4, 3)) return {};
      target.lhEkkoLockUntil = lh.time + 4;
      const ekkoDamage = [30, 40, 50, 60, 70, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140]; // Spieldaten
      return { magic: lhByLevel(ekkoDamage, level) };
    },
  },

  Jhin: {
    name: 'Whisper',
    summary: '4 bis 44 % Bonus-Angriffsschaden. Nach 4 Schüssen wird nachgeladen; der vierte Schuss trifft kritisch (150,5 %) und macht 15 / 20 / 25 % des fehlenden Lebens als Bonus.',
    statMods(level) {
      return { bonusAdPercent: lhByLevel([4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44], level) }; // Spieldaten
    },
    onAttack(state, target, level) {
      state.shots = (state.shots || 0) + 1;
      if (state.shots < 4) return {};
      state.shots = 0;
      return {
        critMultiplier: 1.5, // FourthShotDamageMult laut Spieldaten
        missingHealthPhysical: lhBracket([0.15, 0.2, 0.25], [1, 6, 11], level), // Stufen laut Spieldaten bestätigt
        cooldownOverride: 2.5, // Nachladen nach dem vierten Schuss (Spieldaten: ReloadTime 2,5 s)
      };
    },
  },

  MissFortune: {
    name: 'Love Tap',
    summary: 'Der erste Angriff auf ein neues Ziel macht 25 bis 50 % AD Bonusschaden gegen Minions in Stufen ab Level 1 / 4 / 7 / 9 / 11 / 13 (gegen Champions doppelt so viel). Das Ziel wird markiert, nur ein Ziel gleichzeitig.',
    onAttack(state, target, level) {
      if (state.marked === target) return {};
      state.marked = target;
      // Spieldaten: 50 / 60 / 70 / 80 / 90 / 100 % AD ab Level 1 / 4 / 7 / 9 / 11 / 13, gegen Minions die Hälfte
      return { physical: 0.5 * lhBracket([0.5, 0.6, 0.7, 0.8, 0.9, 1.0], [1, 4, 7, 9, 11, 13], level) * lh.stats.ad };
    },
  },

  Kaisa: {
    name: 'Second Skin',
    summary: 'Jeder Angriff setzt Plasma (4 Sekunden): 4 bis 30 magischen Bonusschaden plus 1 bis 8 pro vorhandenem Stapel. Der 5. Stapel platzt für 15 % des fehlenden Lebens.',
    onAttack(state, target, level) {
      const plasma = target.lhPlasma && lh.time < target.lhPlasma.expires ? target.lhPlasma.stacks : 0;
      const result = { magic: lhLinear(4, 30, level) + lhLinear(1, 8, level) * plasma }; // Spieldaten: 4–30, +1–8 pro Stapel
      if (plasma + 1 >= 5) {
        target.lhPlasma = { stacks: 0, expires: 0 };
        result.missingHealthMagic = 0.15; // Spieldaten: PExecuteRatio 0,15
      } else {
        target.lhPlasma = { stacks: plasma + 1, expires: lh.time + 4 };
      }
      return result;
    },
  },

  Twitch: {
    name: 'Deadly Venom',
    summary: 'Jeder Angriff setzt einen Gift-Stapel für 6 Sekunden (bis 6). Pro Stapel 1 / 2 / 3 / 4 / 5 echter Schaden pro Sekunde (ab Level 1 / 5 / 9 / 13 / 17). Tötet das Gift einen Minion, zählt das als CS.',
    onAttack(state, target, level) {
      return {
        onHit(hitTarget) {
          lhApplyStackDot(hitTarget, 'venom', {
            max: 6, duration: 6, interval: 1, type: 'true',
            perStack: lhBracket([1, 2, 3, 4, 5], [1, 5, 9, 13, 17], level), // Spieldaten: DamagePerSecond in TwitchDeadlyVenomMarker
          });
        },
      };
    },
  },

  Darius: {
    name: 'Hemorrhage',
    summary: 'Jeder Angriff setzt einen Blutungs-Stapel für 5 Sekunden (bis 5): pro Stapel 13 bis 30 physischer Schaden (je nach Level), alle 1,25 Sekunden ein Tick. Ein Tod durch Blutung zählt als CS.',
    onAttack(state, target, level) {
      return {
        onHit(hitTarget) {
          lhApplyStackDot(hitTarget, 'bleed', {
            max: 5, duration: 5.05, interval: 1.26, type: 'physical', // Spieldaten: SecondsPerTick 1,26 (4 Ticks)
            perStack: lhLinear(3.25, 7.5, level), // pro Tick und Stapel (4 Ticks = 13 bis 30)
          });
        },
      };
    },
  },

  XinZhao: {
    name: 'Determination',
    summary: 'Jeder dritte Angriff macht 15 / 30 / 45 / 60 % AD Bonusschaden und heilt um 2 / 3,5 / 5 % des maximalen Lebens (je nach Level).',
    onAttack(state, target, level) {
      state.stacks = (state.stacks || 0) + 1;
      if (state.stacks < 3) return {};
      state.stacks = 0;
      return {
        physical: lhBracket([0.15, 0.3, 0.45, 0.6], [1, 6, 11, 16], level) * lh.stats.ad, // Stufen laut Spieldaten bestätigt
        heal: lhBracket([0.02, 0.035, 0.05], [1, 6, 11], level) * lh.stats.maxHp, // Spieldaten (Bezug auf max. Leben angenommen)
      };
    },
  },

  Sett: {
    name: 'Pit Grit',
    summary: 'Angriffe wechseln zwischen linker und rechter Geraden. Die rechte kommt mit 8-fachem Tempo direkt hinterher und macht 5 bis 90 Bonusschaden (je nach Level). Nach 2 Sekunden ohne rechte Gerade beginnt er wieder links.',
    attackTimeScale(state) {
      state.currentRight = Boolean(state.nextRight) && lh.time - (state.leftAt === undefined ? -99 : state.leftAt) <= 2;
      return state.currentRight ? 1 / 8 : 1;
    },
    onAttack(state, target, level) {
      if (state.currentRight) {
        state.nextRight = false;
        return { physical: lhLinear(5, 90, level) };
      }
      state.nextRight = true;
      state.leftAt = lh.time;
      return {};
    },
  },

  Gwen: {
    name: 'A Thousand Cuts',
    summary: 'Auto-Angriffe machen 1 % des maximalen Lebens des Ziels als magischen Bonus, gegen Minions unter 40 % Leben zusätzlich 8 bis 30 (je nach Level).',
    onAttack(state, target, level) {
      return {
        impactMagic(hitTarget) {
          const low = hitTarget.kind === 'minion' && hitTarget.hp < 0.4 * hitTarget.maxHp;
          return 0.01 * hitTarget.maxHp + (low ? lhLinear(8, 30, level) : 0);
        },
      };
    },
  },

  Gangplank: {
    name: 'Trial by Fire',
    summary: 'Alle 15 Sekunden setzt der nächste Auto-Angriff das Ziel in Brand: 50 bis 250 echter Schaden (je nach Level) über 2,5 Sekunden. Ein Tod durch das Feuer zählt als CS.',
    onAttack(state, target, level) {
      if (lh.time < (state.readyAt || 0)) return {};
      state.readyAt = lh.time + 15;
      return { dot: { total: lhLinear(50, 250, level), duration: 2.5, interval: 0.25 } };
    },
  },

  JarvanIV: {
    name: 'Martial Cadence',
    summary: 'Auto-Angriffe machen 8 % des aktuellen Lebens des Ziels als physischen Bonus (mindestens 20, gegen Minions höchstens 400). Auf dasselbe Ziel nur alle 6 Sekunden.',
    onAttack(state, target) {
      if (lh.time < (target.lhJ4Until || 0)) return {};
      target.lhJ4Until = lh.time + 6;
      return {
        // Berechnet am aktuellen Leben vor dem Treffer
        impactPhysical(hitTarget, hpBefore) {
          return Math.min(400, Math.max(20, 0.08 * hpBefore));
        },
      };
    },
  },

  Nocturne: {
    name: 'Umbra Blades',
    summary: 'Alle 12 Sekunden (jeder Angriff verkürzt um 1 Sekunde) schlägt der nächste Angriff im Kreis (360 Einheiten): 120 % AD am Ziel, gegen umstehende Minions die Hälfte.',
    onAttack(state) {
      state.readyAt = state.readyAt === undefined ? lh.time : state.readyAt;
      if (lh.time < state.readyAt) {
        state.readyAt -= 1; // jeder normale Angriff verkürzt die Abklingzeit
        return {};
      }
      state.readyAt = lh.time + 12; // Abklingzeit laut Spieldaten
      return {
        critMultiplier: 1.2,
        cleave: { radius: 360, physical: 0.6 * lh.stats.ad }, // Radius laut Spieldaten
      };
    },
  },

  Aatrox: {
    name: 'Deathbringer Stance',
    summary: 'Regelmäßig macht der nächste Angriff 4 bis 10 % des maximalen Lebens des Ziels als magischen Bonus (je nach Level) und heilt um 25 % davon gegen Minions.',
    onAttack(state, target, level) {
      if (lh.time < (state.readyAt || 0)) return {};
      state.readyAt = lh.time + lhLinear(22, 10, level); // Spieldaten
      const magic = lhLinear(0.04, 0.1, level) * target.maxHp; // Spieldaten: 4–10 %
      return { magic, heal: 0.25 * magic };
    },
  },

  Urgot: {
    name: 'Echoing Flames',
    summary: 'Sechs Beine mit eigener Abklingzeit (30 / 20 / 10 / 5 / 2,5 Sekunden): Trifft ein Angriff in Richtung eines geladenen Beins, feuert es einen Kegel mit 40 bis 100 % AD plus 2 bis 6 % des maximalen Lebens als physischen Schaden.',
    onAttack(state, target, level) {
      // Beine zeigen fest in sechs Himmelsrichtungen (je 60 Grad)
      const angle = Math.atan2(target.y - player.y, target.x - player.x);
      const leg = ((Math.floor((angle + Math.PI) / (Math.PI / 3)) % 6) + 6) % 6;
      state.legs = state.legs || [0, 0, 0, 0, 0, 0];
      if (lh.time < state.legs[leg]) return {};
      state.legs[leg] = lh.time + lhBracket([30, 20, 10, 5, 2.5], [1, 6, 9, 11, 13], level); // Spieldaten
      const adPart = lhBracket([0.4, 0.52, 0.64, 0.76, 0.88, 1.0], [1, 6, 9, 11, 13, 15], level) * lh.stats.ad; // Spieldaten
      const hpPct = lhBracket([0.02, 0.03, 0.04, 0.05, 0.06], [1, 6, 9, 11, 13], level); // Spieldaten
      return {
        impactPhysical(hitTarget) {
          return adPart + hpPct * hitTarget.maxHp;
        },
        cleave: { radius: 700, physicalFn: (m) => adPart + hpPct * m.maxHp, cone: { angle, width: Math.PI / 3 } }, // Reichweite laut Spieldaten (CastRange 700), Kegelbreite: Schätzung
      };
    },
  },

  Briar: {
    name: 'Crimson Curse',
    summary: 'Angriffe lösen eine Blutung für 5 Sekunden aus (bis 5 Stapel, weitere Stapel zu 25 %): pro Tick alle 0,5 Sekunden 1 bis 5 plus 0,25 bis 1,25 pro weiterem Stapel. Ein Tod durch Blutung zählt als CS.',
    onAttack(state, target, level) {
      const first = lhLinear(1, 5, level);
      const extra = lhLinear(0.25, 1.25, level);
      return {
        onHit(hitTarget) {
          lhApplyStackDot(hitTarget, 'briar', {
            max: 5, duration: 5, interval: 0.5, type: 'physical',
            tickFn: (stacks) => first + extra * (stacks - 1),
          });
        },
      };
    },
  },

  Poppy: {
    name: 'Iron Ambassador',
    summary: 'Alle 16 / 12 / 8 Sekunden (je nach Level) wirft der nächste Angriff den Schild: 350 zusätzliche Reichweite und 20 bis 180 magischer Bonus.',
    rangeBonus(state) {
      return lh.time >= (state.readyAt || 0) ? 350 : 0;
    },
    onAttack(state, target, level) {
      if (lh.time < (state.readyAt || 0)) return {};
      state.readyAt = lh.time + lhBracket([16, 12, 8], [1, 7, 13], level); // Stufen-Level: Schätzung
      return { magic: lhLinear(20, 180, level) };
    },
  },

  Lulu: {
    name: 'Pix, Faerie Companion',
    summary: 'Bei jedem Angriff feuert Pix 3 Geschosse auf das Ziel, je 5 bis 39 magischer Schaden (je nach Level). Holt ein Geschoss den letzten Treffer, zählt das als CS.',
    onAttack(state, target, level) {
      const bolt = lhLinear(5, 39, level);
      // Abstände und Flugzeit der Geschosse: Schätzung
      // Pix-Geschosse fliegen mit 900 Einheiten/s (Spieldaten); Abstand zwischen den Geschossen: Schätzung
      const flight = lhDist(player, target) / LH.UNIT / 900;
      return { extraHits: [0, 1, 2].map((i) => ({ delay: 0.05 + 0.08 * i + flight, magic: bolt })) };
    },
  },

  Nautilus: {
    name: 'Staggering Blow',
    summary: 'Auto-Angriffe machen 14 bis 116 physischen Bonusschaden (+6 pro Level) und wurzeln das Ziel fest. Auf dasselbe Ziel nur alle 6 Sekunden.',
    onAttack(state, target, level) {
      if (lh.time < (target.lhNautUntil || 0)) return {};
      target.lhNautUntil = lh.time + 6;
      return {
        physical: 14 + 6 * (level - 1), // Spieldaten: 14 bis 116
        onHit(hitTarget) {
          hitTarget.lhRootedUntil = lh.time + lhBracket([0.75, 1, 1.25, 1.5], [1, 6, 11, 16], level); // Spieldaten
        },
      };
    },
  },

  Kayle: {
    name: 'Divine Ascent',
    summary: 'Jeder Angriff gibt einen Zeal-Stapel für 5 Sekunden (bis 5) mit je 6 % Bonus-Angriffstempo. Ab Level 6 wird sie Fernkämpferin mit 525 Reichweite.',
    statMods(level) {
      return level >= 6 ? { range: 525 } : {};
    },
    attackSpeedBonus(state) {
      return lh.time < (state.zealUntil || 0) ? 6 * (state.zeal || 0) : 0;
    },
    onAttack(state) {
      state.zeal = lh.time < (state.zealUntil || 0) ? Math.min(5, (state.zeal || 0) + 1) : 1;
      state.zealUntil = lh.time + 5;
      return {};
    },
  },

  Locke: {
    name: 'Silver Stake',
    summary: 'Auto-Angriffe machen 5 bis 40 magischen Bonus (je nach Level), erhöht um bis zu 100 % je nach fehlendem Leben des Ziels.',
    onAttack(state, target, level) {
      const base = lhLinear(5, 40, level);
      return {
        impactMagic(hitTarget) {
          const missing = 1 - hitTarget.hp / hitTarget.maxHp;
          return base * (1 + Math.max(0, Math.min(1, missing)));
        },
      };
    },
  },

  Warwick: {
    name: 'Eternal Hunger',
    summary: 'Auto-Angriffe machen 6 bis 55 magischen Bonusschaden (je nach Level). Unter 50 % Leben heilt Warwick um diesen Schaden, unter 25 % um das 2,5-Fache.',
    onAttack(state, target, level) {
      const magic = lhLinear(6, 55, level); // Spieldaten: 6 bis 55
      const ratio = lh.hp / lh.stats.maxHp;
      const heal = ratio < 0.25 ? 2.5 * magic : ratio < 0.5 ? magic : 0;
      return { magic, heal };
    },
  },

  Quinn: {
    name: 'Harrier',
    summary: 'Valor markiert regelmäßig (7 Sekunden Abklingzeit) einen Minion in der Nähe für 4,5 Sekunden (orangener Ring). Quinns Angriff auf das markierte Ziel macht 15 bis 120 physischen Bonusschaden.',
    onUpdate(state) {
      const marked = state.marked;
      if (marked && (!marked.alive || lh.time >= marked.lhQuinnMarkUntil)) {
        if (marked.alive) marked.lhQuinnMarkUntil = 0;
        state.marked = null;
        state.readyAt = lh.time + 7; // nach Ablauf der Markierung erst wieder nach der Abklingzeit
      }
      if (state.marked || lh.time < (state.readyAt || 0)) return;
      // Valor markiert bevorzugt Quinns aktuelles Ziel, sonst den nächsten Minion (Reichweite: Schätzung)
      const reach = 900 * LH.UNIT;
      const current = lh.attackTarget;
      let pick = current && current.alive && lh.minions.includes(current) && lhDist(current, player) <= reach ? current : null;
      if (!pick) {
        pick = lh.minions
          .filter((m) => m.alive && m.team === 'red' && lhDist(m, player) <= reach)
          .sort((a, b) => lhDist(a, player) - lhDist(b, player))[0];
      }
      if (pick) {
        pick.lhQuinnMarkUntil = lh.time + 4.5;
        state.marked = pick;
      }
    },
    onAttack(state, target, level) {
      if (state.marked !== target || lh.time >= (target.lhQuinnMarkUntil || 0)) return {};
      target.lhQuinnMarkUntil = 0;
      state.marked = null;
      state.readyAt = lh.time + 7;
      return { physical: lhLinear(15, 120, level) };
    },
  },

  Naafiri: {
    name: 'We Are More',
    summary: 'Ihre Rudeltiere (2 / 3 / 4 / 5 ab Level 1 / 9 / 12 / 15) greifen nach ihren Angriffen 2 Sekunden lang ihr Ziel an, mit ihrem Angriffstempo und je 10 bis 20 physischem Schaden. Gelegentlich erledigen sie selbst Minions unter 25 bis 76 Leben. Ihre Todesstöße zählen als CS.',
    onAttack(state, target) {
      state.packTarget = target;
      state.packUntil = lh.time + 2;
      return {};
    },
    onUpdate(state) {
      const count = lhBracket([2, 3, 4, 5], [1, 9, 12, 15], lh.level);
      const interval = 1 / lh.stats.attackSpeed; // 100 % von Naafiris Angriffstempo
      const damage = lhLinear(10, 20, lh.level);
      const snipeBelow = 25 + 3 * (lh.level - 1); // Spieldaten: 25 bis 76
      const reach = 400 * LH.UNIT; // Umkreis für eigene Todesstöße: Schätzung
      state.packNext = state.packNext || [];
      state.snipeReady = state.snipeReady || [];
      const engaged = state.packTarget && state.packTarget.alive && lh.time < (state.packUntil || 0);

      for (let i = 0; i < count; i += 1) {
        if (state.packNext[i] === undefined) state.packNext[i] = lh.time + 0.12 * i;
        if (lh.time < state.packNext[i]) continue;

        // Gelegentlich: ein angeschlagener Minion in der Nähe wird vom Rudeltier selbst erledigt
        // (pro Tier höchstens alle 3 Sekunden, Schätzung)
        if (lh.time >= (state.snipeReady[i] || 0)) {
          const prey = lh.minions.find((m) => m.alive && m.team === 'red' && m.hp < snipeBelow && lhDist(m, player) <= reach);
          if (prey) {
            state.packNext[i] = lh.time + interval;
            state.snipeReady[i] = lh.time + 3;
            lhDamage(prey, prey.hp, LH_PLAYER); // Hinrichtung: Minion unter der Grenze stirbt sofort (MinionExecuteThreshold)
            continue;
          }
        }

        if (!engaged) continue;
        state.packNext[i] = lh.time + interval;
        lhDamage(state.packTarget, lhMitigate(damage, state.packTarget.armor), LH_PLAYER);
        if (!state.packTarget.alive) break;
      }
    },
  },

  Graves: {
    name: 'New Destiny',
    summary: 'Jeder Schuss feuert 4 Schrotkugeln: die erste 70 bis 100 % AD, jede weitere auf dasselbe Ziel 33,3 % davon. Minions vor dem Ziel fangen Kugeln ab. Nach 2 Schüssen wird nachgeladen (2,08 Sekunden auf Level 1, schneller mit steigendem Level).',
    attackTimeScale(state) {
      // Zwischen den zwei Patronen kurzer Abstand (Schätzung 0,4 s), danach Nachladen
      return 0.4 * lh.stats.attackSpeed; // Nachladen kommt über cooldownOverride dazu
    },
    onAttack(state, target, level) {
      if (state.shells === undefined || state.shells <= 0) state.shells = 2;
      state.shells -= 1;
      const first = lhByLevel([0.7, 0.7113, 0.7234, 0.7363, 0.75, 0.7644, 0.7797, 0.7958, 0.8126, 0.8303, 0.8487, 0.8679, 0.888, 0.9088, 0.9304, 0.9528, 0.976, 1.0001], level); // Spieldaten
      const extra = 0.333 * first; // weitere Kugeln: 33,3 % der ersten (Spieldaten)
      // Minions zwischen Graves und dem Ziel im Kegel fangen je eine Kugel ab (Kegel: Schätzung ±15 Grad)
      const aim = Math.atan2(target.y - player.y, target.x - player.x);
      const targetDist = lhDist(target, player);
      const blockers = lh.minions
        .filter((m) => m.alive && m.team === 'red' && m !== target && lhDist(m, player) < targetDist)
        .filter((m) => {
          let diff = Math.atan2(m.y - player.y, m.x - player.x) - aim;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          return Math.abs(diff) <= Math.PI / 12;
        })
        .sort((a, b) => lhDist(a, player) - lhDist(b, player))
        .slice(0, 3);
      const onTarget = 4 - blockers.length;
      const result = {
        critMultiplier: first + extra * (onTarget - 1),
        splashHits: blockers.map((unit) => ({ unit, physical: first * lh.stats.ad })),
      };
      if (state.shells === 0) {
        // 2,08 s ohne Bonus; sinkt mit dem Angriffstempo-Zuwachs pro Level (genaue Formel laut Wiki unbekannt)
        const growthAs = ((lh.champ.stats.attackspeedperlevel || 0) * lhGrowth(level)) / 100;
        result.cooldownOverride = 2.08 / (1 + growthAs);
      }
      return result;
    },
  },

  Zeri: {
    name: 'Living Battery',
    summary: 'Ihre Angriffe machen statt Angriffsschaden 10 bis 25 magischen Schaden und richten Ziele unter 70 bis 160 Leben hin (je nach Level). Laufen lädt sie auf (1 Ladung pro 40 Einheiten, gelber Balken). Bei voller Ladung macht der nächste Angriff 75 bis 160 plus 1 bis 11 % des maximalen Lebens.',
    resourceBar(state) {
      return (state.charge === undefined ? 100 : state.charge) / 100;
    },
    onUpdate(state) {
      if (state.charge === undefined) state.charge = 100; // startet voll aufgeladen
      if (state.lastX !== undefined) {
        const moved = Math.hypot(player.x - state.lastX, player.y - state.lastY) / LH.UNIT;
        state.charge = Math.min(100, state.charge + moved / 40);
      }
      state.lastX = player.x;
      state.lastY = player.y;
    },
    onAttack(state, target, level) {
      if (state.charge === undefined) state.charge = 100;
      if (state.charge >= 100) {
        state.charge = 0;
        return { critMultiplier: 0, magic: lhLinear(75, 160, level) + lhLinear(0.01, 0.11, level) * target.maxHp };
      }
      if (state.charge >= 10) state.charge -= 10;
      return { critMultiplier: 0, magic: lhLinear(10, 25, level), executeBelow: lhLinear(70, 160, level) };
    },
  },

  Shaco: {
    name: 'Backstab',
    summary: 'Trifft er einen Minion von hinten, macht sein Angriff 20 bis 35 physischen Bonusschaden (je nach Level), pro Ziel höchstens alle 3 Sekunden. Minions blicken in ihre Lauf- oder Angriffsrichtung.',
    onAttack(state, target, level) {
      if (lh.time < (target.lhShacoLockUntil || 0) || !lhIsBehind(target)) return {}; // Sperre pro Ziel 3 s (PerUnitCD)
      target.lhShacoLockUntil = lh.time + 3;
      return { behindPhysical: lhLinear(20, 35, level) }; // Spieldaten: 20 bis 35
    },
  },

  Bard: {
    name: "Traveler's Call",
    summary: 'Ein Meep begleitet ihn (ohne Chimes nur einer): Der nächste Angriff verbraucht ihn und macht 35 magischen Bonusschaden. Neuer Meep nach 8 Sekunden.',
    onAttack(state) {
      if (lh.time < (state.meepAt || 0)) return {};
      state.meepAt = lh.time + 8;
      return { magic: 35 };
    },
  },

  Jax: {
    name: 'Relentless Assault',
    summary: 'Jeder Angriff gibt einen Stapel für 2,5 Sekunden (bis 8) mit 5 bis 12,5 % Bonus-Angriffstempo pro Stapel (Stufen ab Level 1 / 4 / 7 / 10 / 13 / 16). Danach verfallen die Stapel einzeln alle 0,35 Sekunden.',
    currentStacks(state) {
      if (!state.stacks) return 0;
      const over = lh.time - state.until;
      return over <= 0 ? state.stacks : Math.max(0, state.stacks - Math.ceil(over / 0.35)); // FallOffRate 0,35 s
    },
    attackSpeedBonus(state) {
      return this.currentStacks(state) * lhBracket([5, 6.5, 8, 9.5, 11, 12.5], [1, 4, 7, 10, 13, 16], lh.level); // Spieldaten
    },
    onAttack(state) {
      state.stacks = Math.min(8, this.currentStacks(state) + 1);
      state.until = lh.time + 2.5;
      return {};
    },
  },

  Volibear: {
    name: 'The Relentless Storm',
    summary: 'Jeder Treffer gibt einen Stapel für 6 Sekunden (bis 5) mit 5 % Bonus-Angriffstempo. Ab 5 Stapeln springt ein Blitz mit 11 bis 60 magischem Schaden vom Ziel zu bis zu 4 Minions in der Nähe.',
    attackSpeedBonus(state) {
      return lh.time < (state.until || 0) ? 5 * state.stacks : 0;
    },
    onAttack(state, target, level) {
      state.stacks = lh.time < (state.until || 0) ? Math.min(5, state.stacks + 1) : 1;
      state.until = lh.time + 6;
      if (state.stacks < 5) return {};
      const chainDamage = [11, 12, 13, 15, 17, 19, 22, 25, 28, 31, 34, 37, 40, 44, 48, 52, 56, 60]; // Spieldaten
      return { chain: { magic: lhByLevel(chainDamage, level), range: 450, jumps: 4 } }; // 5 Ziele insgesamt (BounceCounterMax 5)
    },
  },

  Belveth: {
    name: 'Death in Lavender',
    summary: 'Stirbt ein Kanonen-Minion in ihrer Nähe, erhält sie dauerhaft 2 Lavender-Stapel mit je 0,1 bis 2 % Bonus-Angriffstempo (je nach Level). Ihr Angriffstempo wächst nicht pro Level.',
    attackSpeedBonus(state) {
      return (state.lavender || 0) * lhByLevel([0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.95, 1.1, 1.25, 1.4, 1.55, 1.7, 1.85, 2.0], lh.level); // Spieldaten
    },
    onMinionDeath(state, minion) {
      if (minion.type === 'siege' && lhDist(minion, player) <= 1000 * LH.UNIT) state.lavender = (state.lavender || 0) + 2; // "in der Nähe": Schätzung
    },
    onAttack() {
      return {};
    },
  },

  Caitlyn: {
    name: 'Headshot',
    summary: 'Nach 5 Angriffen wird der nächste zum Headshot: 110 % AD Bonusschaden gegen Minions (auf jedem Level).',
    onAttack(state, target, level) {
      if ((state.stacks || 0) >= 5) {
        state.stacks = 0; // Annahme: der Headshot selbst baut keinen neuen Stapel auf
        return { physical: 1.1 * lh.stats.ad }; // Spieldaten: gegen Minions auf jedem Level 110 % AD
      }
      state.stacks = (state.stacks || 0) + 1;
      return {};
    },
  },

  Yone: {
    name: 'Way of the Hunter',
    summary: 'Jeder zweite Auto-Angriff macht je zur Hälfte physischen und magischen Schaden. Minions haben keine Magieresistenz, deshalb kommt dabei mehr an.',
    onAttack(state) {
      state.count = (state.count || 0) + 1;
      return state.count % 2 === 0 ? { adMagicShare: 0.5 } : {};
    },
  },

  MasterYi: {
    name: 'Double Strike',
    summary: 'Bei 3 Stapeln schlägt der nächste Angriff zweimal zu, der zweite Schlag mit 50 % AD. Der zweite Schlag baut schon den nächsten Stapel auf.',
    onAttack(state) {
      // Zähler verfällt außerhalb des Kampfes (Annahme: 4 Sekunden ohne Angriff)
      if (lh.time - (state.lastAttack || -99) > 4) state.stacks = 0;
      state.lastAttack = lh.time;
      if ((state.stacks || 0) >= 3) {
        state.stacks = 1; // der zweite Schlag setzt sofort wieder einen Stapel
        return { secondShot: { delay: 0.1, adRatio: 0.5, retarget: true } }; // Verzögerung: Schätzung
      }
      state.stacks = (state.stacks || 0) + 1;
      return {};
    },
  },

  Corki: {
    name: 'Hextech Munitions',
    summary: 'Auto-Angriffe machen zusätzlich echten Schaden in Höhe von 20 % AD.',
    onAttack() {
      return { true: 0.2 * lh.stats.ad };
    },
  },
};

// Stapelbarer Schaden über Zeit (Twitchs Gift, Darius' Blutung): jeder Treffer erhöht die Stapel
// und frischt die Dauer auf; der Tick-Takt läuft weiter. Ein tödlicher Tick zählt als dein Last Hit.
function lhApplyStackDot(target, key, cfg) {
  target.lhStackDots = target.lhStackDots || {};
  const current = target.lhStackDots[key];
  const active = current && lh.time < current.expires;
  target.lhStackDots[key] = {
    stacks: Math.min(cfg.max, (active ? current.stacks : 0) + 1),
    expires: lh.time + cfg.duration,
    interval: cfg.interval,
    next: active ? current.next : lh.time + cfg.interval,
    perStack: cfg.perStack,
    tickFn: cfg.tickFn,
    type: cfg.type,
  };
}

// Gleichmäßiger echter Schaden über Zeit (Gangplanks Feuer)
function lhAddDot(target, dot) {
  const ticks = Math.round(dot.duration / dot.interval);
  target.lhDots = target.lhDots || [];
  target.lhDots.push({ perTick: dot.total / ticks, interval: dot.interval, next: lh.time + dot.interval, ticks });
}

function lhUpdateDots() {
  for (const minion of lh.minions) {
    if (!minion.alive) continue;

    if (minion.lhStackDots) {
      for (const key of Object.keys(minion.lhStackDots)) {
        const dot = minion.lhStackDots[key];
        if (lh.time >= dot.next && minion.alive) {
          dot.next += dot.interval;
          const raw = dot.tickFn ? dot.tickFn(dot.stacks) : dot.stacks * dot.perStack;
          lhDamage(minion, dot.type === 'physical' ? lhMitigate(raw, minion.armor) : raw, LH_PLAYER);
        }
        if (lh.time >= dot.expires) delete minion.lhStackDots[key];
      }
    }

    if (minion.lhDots && minion.lhDots.length) {
      for (const dot of minion.lhDots) {
        while (dot.ticks > 0 && lh.time >= dot.next && minion.alive) {
          dot.ticks -= 1;
          dot.next += dot.interval;
          lhDamage(minion, dot.perTick, LH_PLAYER);
        }
      }
      minion.lhDots = minion.lhDots.filter((dot) => dot.ticks > 0);
    }
  }
}

const lhBoardKey = 'hextech-lasthit-board-v2'; // pro Wellenzahl; die alte Liste (Zählung bis 107) bleibt unter dem alten Schlüssel
const LH_BOARD_SIZE = 5;

// Die Spielfigur als Einheit für Zielwahl und Schaden
const LH_PLAYER = {
  kind: 'player',
  team: 'blue',
  get x() { return player.x; },
  get y() { return player.y; },
  get radius() { return player.radius; },
  get alive() { return lh.running && lh.hp > 0; },
};

const lh = {
  running: false,
  over: false,
  time: 0,
  minions: [],
  missiles: [],
  floats: [],
  turrets: [],
  queue: [],
  cs: 0,
  possible: 0,
  missed: 0,
  xp: 0,
  level: 1,
  champ: null,
  stats: null,
  hp: 0,
  attackTarget: null,
  attackCooldown: 0,
  windup: 0,
  chaseTimer: 0,
  attackingRecently: 0,
  holdAttack: false,
  endReason: '',
  lastRank: 0,
  passiveState: {},
  slashes: [], // Hieb-Effekte der Nahkampf-Angriffe
  beams: [], // Strahlen der Fernkämpfer ohne Geschoss
  playerSwing: null, // Ausholen und Vorstoßen der Figur bei Nahkampf-Angriffen
  delayed: [], // zeitversetzte Aktionen (z. B. zweiter Schuss)
  nextId: 1,
};

// -----------------------------------------------------------------------------
// Hilfsfunktionen
// -----------------------------------------------------------------------------
function lhDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Reichweiten werden wie in LoL von Rand zu Rand gemessen
function lhEdgeDist(a, b) {
  return lhDist(a, b) - a.radius - b.radius;
}

function lhFormatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function lhMitigate(damage, armor) {
  return damage * (100 / (100 + Math.max(0, armor)));
}

function lhUpgradesAt(spawnTime) {
  return 1 + Math.floor((spawnTime - LH.FIRST_SPAWN) / LH.UPGRADE_INTERVAL);
}

// Wachstum pro Level wie in LoL: Grundwert + Zuwachs x (n-1) x (0,7025 + 0,0175 x (n-1))
function lhGrowth(level) {
  return (level - 1) * (0.7025 + 0.0175 * (level - 1));
}

function lhChampStats(level) {
  const s = lh.champ.stats;
  const g = lhGrowth(level);
  const passive = LH_PASSIVES[lh.champ.id];
  const mods = passive && passive.statMods ? passive.statMods(level) : {};
  const baseAd = (s.attackdamage || 60) + (s.attackdamageperlevel || 0) * g;
  return {
    maxHp: (s.hp || 600) + (s.hpperlevel || 0) * g,
    armor: (s.armor || 30) + (s.armorperlevel || 0) * g,
    ad: baseAd * (1 + (mods.bonusAdPercent || 0) / 100),
    attackSpeed: (s.attackspeed || 0.65) * (1 + ((s.attackspeedperlevel || 0) * g + (mods.bonusAsPercent || 0)) / 100),
    range: mods.range || s.attackrange || 500,
    speed: s.movespeed || 330,
    regen: ((s.hpregen || 0) + (s.hpregenperlevel || 0) * g) / 5,
  };
}

function lhIsMelee() {
  return lh.stats.range < LH.MELEE_RANGE_LIMIT;
}

// Angriffsdaten des gewählten Champions (Animation, Projektiltempo, Radius) mit Ersatzwerten
function lhAttackInfo() {
  const data = typeof LH_ATTACK_DATA !== 'undefined' ? LH_ATTACK_DATA[lh.champ.id] : null;
  return {
    windup: data && data[0] ? data[0] : LH.WINDUP_SHARE,
    // null = unbekannt (Ersatzwert), 0 = kein Geschoss (Treffer sofort am Ende der Animation)
    missile: data && data[1] !== null && data[1] !== undefined ? data[1] : null,
    radius: data && data[2] ? data[2] : LH.CHAMPION_RADIUS,
    windupModifier: data && data[3] !== null && data[3] !== undefined ? data[3] : 1,
    known: Boolean(data),
  };
}

function lhProjectileSpeed() {
  const info = lhAttackInfo();
  if (info.missile) return info.missile * LH.UNIT;
  const tags = lh.champ.tags || [];
  return (tags.includes('Marksman') ? LH.PROJECTILE_SPEED.Marksman : LH.PROJECTILE_SPEED.default) * LH.UNIT;
}

function lhTurretDamage(time) {
  if (time < 30) return TURRET.adStart;
  const steps = Math.floor((time - 30) / 60) + 1;
  return Math.min(TURRET.adMax, TURRET.adStart + TURRET.adPerMinute * steps);
}

function lhFloat(x, y, text, color, life = 0.9) {
  lh.floats.push({ x, y, text, color, life, maxLife: life });
}

function lhUnitAlive(unit) {
  if (!unit) return false;
  if (unit.kind === 'turret') return true; // Türme sind unzerstörbar
  return unit.alive;
}

// -----------------------------------------------------------------------------
// Ablaufplan der Wellen
// -----------------------------------------------------------------------------
const lhWavesKey = 'hextech-lasthit-waves';

function lhSelectedWaves() {
  try {
    const value = Number(localStorage.getItem(lhWavesKey));
    if (Number.isInteger(value) && value >= 1 && value <= LH.MAX_WAVES) return value;
  } catch (error) {
    // nicht lesbar: Standardwert
  }
  return LH.DEFAULT_WAVES;
}

function lhSetSelectedWaves(value) {
  const waves = Math.max(1, Math.min(LH.MAX_WAVES, Math.round(value)));
  try {
    localStorage.setItem(lhWavesKey, String(waves));
  } catch (error) {
    // nicht speicherbar: gilt nur für diese Sitzung
  }
  return waves;
}

// Perfekt-Wert: 6 Minions pro Welle plus eine Kanone in jeder dritten Welle (Welle 3, 6, 9 ...)
function lhPerfectFor(waves) {
  return waves * 6 + Math.floor(waves / 3);
}

// Ungefähres Ende: letzte Welle trifft sich in der Mitte, plus etwa 35 Sekunden Kampf (aus der Simulation)
function lhEstimatedEnd(waves) {
  const travel = LH.NEXUS_TO_TURRET / LH.MINION_SPEED;
  const meet = LH.FIRST_SPAWN + (waves - 1) * LH.WAVE_INTERVAL + travel + 5.4;
  return meet + 35;
}

function lhBuildQueue(maxWaves = LH.DEFAULT_WAVES) {
  const queue = [];
  const travel = LH.NEXUS_TO_TURRET / LH.MINION_SPEED;

  for (let wave = 0; wave < maxWaves; wave += 1) {
    const spawnTime = LH.FIRST_SPAWN + wave * LH.WAVE_INTERVAL;
    const appear = spawnTime + travel;

    const types = ['melee', 'melee', 'melee'];
    if (wave >= 2 && (wave - 2) % 3 === 0) types.push('siege'); // Kanone ab Welle 3, dann jede dritte (Patch 26.1)
    types.push('caster', 'caster', 'caster');

    const upgrades = lhUpgradesAt(spawnTime);
    types.forEach((type, index) => {
      for (const team of ['blue', 'red']) {
        queue.push({ time: appear + index * LH.SPAWN_GAP, type, team, wave, upgrades });
      }
    });
  }

  return queue.sort((a, b) => a.time - b.time);
}

function lhSpawn(entry) {
  const type = MINION_TYPES[entry.type];
  const path = entry.team === 'blue' ? LH_PATH : LH_PATH_REV;
  const start = path[0];
  const next = path[1];
  const dirX = next.x - start.x;
  const dirY = next.y - start.y;
  const length = Math.hypot(dirX, dirY) || 1;
  const side = (Math.random() - 0.5) * 8; // leicht versetzt, damit sie nicht exakt übereinander stehen
  const maxHp = type.hp(entry.upgrades);

  lh.minions.push({
    id: lh.nextId++,
    kind: 'minion',
    type: entry.type,
    team: entry.team,
    wave: entry.wave,
    x: start.x + (-dirY / length) * side,
    y: start.y + (dirX / length) * side,
    radius: type.radius * LH.UNIT,
    maxHp,
    hp: maxHp,
    ad: type.ad(entry.upgrades),
    armor: type.armor(entry.upgrades),
    mr: 0, // Minions haben keine Magieresistenz
    path,
    pathIndex: 1,
    resumeLane: false,
    target: null,
    targetPriority: 99,
    cooldown: 0,
    windup: 0,
    retarget: Math.random() * LH.RETARGET_TIME,
    ghostUntil: entry.wave === 0 ? lh.time + LH.FIRST_WAVE_GHOST : 0,
    graceTimer: 0,
    graceSource: null,
    alive: true,
  });
}

// -----------------------------------------------------------------------------
// Zielwahl der Minions (Prioritäten wie in LoL, kleinere Zahl = wichtiger)
// -----------------------------------------------------------------------------
function lhPriority(minion, candidate) {
  if (candidate.kind === 'minion') {
    if (candidate.target && candidate.target.kind === 'player' && candidate.target.team === minion.team) return 2;
    if (candidate.target && candidate.target.kind === 'minion' && candidate.target.team === minion.team) return 3;
    return 6;
  }
  if (candidate.kind === 'turret') {
    if (candidate.target && candidate.target.kind === 'minion' && candidate.target.team === minion.team) return 4;
    return 6.5; // Gebäude: wenn keine Minions mehr da sind
  }
  if (candidate.kind === 'player') {
    // Champion greift einen eigenen Minion an
    // Seit Patch 26.10 zieht ein Champion, der Minions angreift, keine Minion-Aggro mehr
    return 7;
  }
  return 99;
}

function lhEnemiesOf(minion) {
  const enemies = lh.minions.filter((m) => m.alive && m.team !== minion.team);
  const turret = lh.turrets.find((t) => t.team !== minion.team);
  if (turret) enemies.push(turret);
  if (minion.team === 'red' && LH_PLAYER.alive) enemies.push(LH_PLAYER);
  return enemies;
}

function lhChooseTarget(minion) {
  const reach = LH.ACQUISITION * LH.UNIT;
  const enemies = lhEnemiesOf(minion).filter((e) => lhEdgeDist(minion, e) <= reach);
  if (!enemies.length) return null;

  // Erste Welle: Angriffe auf die drei gegnerischen Melee-Minions verteilen
  if (minion.wave === 0) {
    const firstMelee = lh.minions.filter((m) => m.alive && m.team !== minion.team && m.wave === 0 && m.type === 'melee');
    if (firstMelee.length) {
      let best = null;
      let fewest = Infinity;
      for (const enemy of firstMelee) {
        const attackers = lh.minions.filter((m) => m.alive && m.target === enemy).length;
        if (attackers < fewest || (attackers === fewest && lhDist(minion, enemy) < lhDist(minion, best))) {
          fewest = attackers;
          best = enemy;
        }
      }
      return { unit: best, priority: 3 };
    }
  }

  let best = null;
  for (const enemy of enemies) {
    const priority = lhPriority(minion, enemy);
    const distance = lhDist(minion, enemy);
    if (!best || priority < best.priority || (priority === best.priority && distance < best.distance)) {
      best = { unit: enemy, priority, distance };
    }
  }
  return best;
}

function lhTargetStillValid(minion) {
  const target = minion.target;
  if (!lhUnitAlive(target)) return false;
  // Ziel verloren, wenn es zu weit weg ist
  return lhEdgeDist(minion, target) <= LH.ACQUISITION * LH.UNIT * 1.6;
}

// -----------------------------------------------------------------------------
// Bewegung
// -----------------------------------------------------------------------------
function lhMoveToward(unit, x, y, step) {
  const dx = x - unit.x;
  const dy = y - unit.y;
  const distance = Math.hypot(dx, dy);
  if (step > 0 && distance > 0.001) unit.facing = Math.atan2(dy, dx);
  if (distance < 0.001) return;
  const move = Math.min(step, distance);
  unit.x += (dx / distance) * move;
  unit.y += (dy / distance) * move;
}

// Nach einer Verfolgung wieder beim nächsten Wegpunkt in Laufrichtung einsteigen
function lhResumeLane(minion) {
  const path = minion.path;
  let bestIndex = 1;
  let bestDistance = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = { ax: path[i].x, ay: path[i].y, bx: path[i + 1].x, by: path[i + 1].y };
    const point = closestPointOnWall(segment, minion.x, minion.y);
    const distance = Math.hypot(point.x - minion.x, point.y - minion.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i + 1;
    }
  }
  minion.pathIndex = bestIndex;
  minion.resumeLane = false;
}

function lhFollowLane(minion, step) {
  if (minion.resumeLane) lhResumeLane(minion);
  while (minion.pathIndex < minion.path.length) {
    const point = minion.path[minion.pathIndex];
    // Wegpunkt erreicht, wenn nah genug (etwa der eigene Radius) oder schon daran vorbei.
    // Sonst blockieren sich mehrere Minions am selben Wegpunkt gegenseitig.
    const prev = minion.path[minion.pathIndex - 1] || point;
    const passed = (point.x - prev.x) * (minion.x - point.x) + (point.y - prev.y) * (minion.y - point.y) > 0;
    if (Math.hypot(point.x - minion.x, point.y - minion.y) < minion.radius + 2 || passed) {
      minion.pathIndex += 1;
      continue;
    }
    lhMoveToward(minion, point.x, point.y, step);
    return;
  }
  // Ende des Wegs: am gegnerischen Turm stehen bleiben (der Turm ist dann Ziel)
}

// Einheiten schieben sich auseinander, Minions blocken auch die Figur.
// Mehrere Durchgänge pro Frame, damit auch im Gedränge keiner im anderen steht.
function lhSeparate() {
  const units = lh.minions.filter((m) => m.alive && !(m.ghostUntil > lh.time));

  for (let pass = 0; pass < LH.SEPARATION_PASSES; pass += 1) {
    let moved = false;

    for (let i = 0; i < units.length; i += 1) {
      for (let j = i + 1; j < units.length; j += 1) {
        const a = units[i];
        const b = units[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.001) {
          // exakt übereinander: in zufällige Richtung trennen
          const angle = Math.random() * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const overlap = a.radius + b.radius - distance;
        if (overlap > 0) {
          const nx = dx / distance;
          const ny = dy / distance;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;
          moved = true;
        }
      }
    }

    // Türme sind feste Hindernisse
    for (const minion of units) {
      for (const turret of lh.turrets) {
        const dx = minion.x - turret.x;
        const dy = minion.y - turret.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        const overlap = minion.radius + turret.radius - distance;
        if (overlap > 0) {
          minion.x += (dx / distance) * overlap;
          minion.y += (dy / distance) * overlap;
          moved = true;
        }
      }
    }

    // Figur und Minions blocken sich gegenseitig
    for (const minion of units) {
      const dx = player.x - minion.x;
      const dy = player.y - minion.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const overlap = player.radius + minion.radius - distance;
      if (overlap > 0) {
        const nx = dx / distance;
        const ny = dy / distance;
        player.x += nx * overlap * 0.7;
        player.y += ny * overlap * 0.7;
        minion.x -= nx * overlap * 0.3;
        minion.y -= ny * overlap * 0.3;
        moved = true;
      }
    }

    if (!moved) break;
  }
}

// -----------------------------------------------------------------------------
// Schaden
// -----------------------------------------------------------------------------
function lhKillMinion(minion, source) {
  if (!minion.alive) return;
  minion.alive = false;
  const passiveOnDeath = lh.champ && LH_PASSIVES[lh.champ.id];
  if (passiveOnDeath && passiveOnDeath.onMinionDeath && minion.team === 'red') passiveOnDeath.onMinionDeath(lh.passiveState, minion);
  createBurst(minion.x, minion.y, LH_COLORS[minion.team].light, 10);

  if (minion.team !== 'red') return;

  lh.possible += 1;
  if (source === LH_PLAYER) {
    lh.cs += 1;
    lhFloat(minion.x, minion.y - minion.radius - 4, '+1', '#fbbf24');
  } else {
    lh.missed += 1;
    lhFloat(minion.x, minion.y - minion.radius - 4, 'verpasst', 'rgba(248, 113, 113, 0.9)', 0.7);
  }

  // Erfahrung, wenn die Figur nah genug ist
  if (LH_PLAYER.alive && lhDist(minion, LH_PLAYER) <= LH.XP_RANGE * LH.UNIT) {
    lhGainXp(MINION_TYPES[minion.type].xp * 0.95); // allein in Reichweite: 95 % (seit Patch 12.22)
  }
}

function lhDamage(target, amount, source) {
  if (!lhUnitAlive(target) || amount <= 0) return;

  if (target.kind === 'minion') {
    // Während der "Todes-Gnade" tötet jeder weitere Treffer
    if (target.graceTimer > 0) {
      lhKillMinion(target, source);
      return;
    }
    if (amount >= target.hp) {
      const fromMinion = source && source.kind === 'minion';
      if (fromMinion && target.hp < 0.0035 * target.maxHp && amount <= 190) {
        target.hp = 1;
        target.graceTimer = 0.066;
        target.graceSource = source;
        return;
      }
      lhKillMinion(target, source);
      return;
    }
    target.hp -= amount;
    return;
  }

  if (target.kind === 'player') {
    lh.hp -= amount;
    if (lh.hp <= 0) {
      lh.hp = 0;
      lhEnd('dead');
    }
  }
  // Türme sind unzerstörbar und nehmen keinen Schaden
}

function lhMinionDamageTo(minion, target) {
  const type = MINION_TYPES[minion.type];
  if (target.kind === 'minion') {
    return lhMitigate(minion.ad + type.vsMinion * target.hp, target.armor);
  }
  if (target.kind === 'player') {
    return lhMitigate(minion.ad * LH.DAMAGE_TO_CHAMPIONS, lh.stats.armor);
  }
  return 0;
}

function lhMissile(fromX, fromY, target, speed, impact, style) {
  lh.missiles.push({ x: fromX, y: fromY, target, speed, impact, ...style });
}

// -----------------------------------------------------------------------------
// Minions
// -----------------------------------------------------------------------------
function lhMinionFire(minion) {
  const target = minion.target;
  if (!lhUnitAlive(target)) return;
  const type = MINION_TYPES[minion.type];

  if (!type.missile) {
    lhSlash(target, minion, LH_COLORS[minion.team].light, false);
    if (minion.swing) minion.swing.hitAt = lh.time;
    lhDamage(target, lhMinionDamageTo(minion, target), minion);
    return;
  }

  const color = LH_COLORS[minion.team].light;
  lhMissile(minion.x, minion.y, target, type.missile * LH.UNIT, () => {
    // Schaden wird beim Einschlag berechnet (Zusatzschaden vom aktuellen Leben)
    lhDamage(target, lhMinionDamageTo(minion, target), minion);
  }, { color, size: minion.type === 'siege' ? 3.2 : 2.2 });
}

function lhUpdateMinion(minion, dt) {
  const type = MINION_TYPES[minion.type];

  if (minion.graceTimer > 0) {
    minion.graceTimer -= dt;
    if (minion.graceTimer <= 0) lhKillMinion(minion, minion.graceSource);
    return;
  }

  if (minion.target && !lhTargetStillValid(minion)) {
    minion.target = null;
    minion.targetPriority = 99;
    minion.windup = 0;
    minion.resumeLane = true;
  }

  // Ziel suchen oder zwischen Angriffen auf ein wichtigeres Ziel wechseln
  minion.retarget -= dt;
  if (!minion.target || (minion.windup <= 0 && minion.retarget <= 0)) {
    minion.retarget = LH.RETARGET_TIME;
    const best = lhChooseTarget(minion);
    if (best && (!minion.target || best.priority < minion.targetPriority)) {
      minion.target = best.unit;
      minion.targetPriority = best.priority;
      minion.windup = 0;
    }
  }

  minion.cooldown -= dt;
  // Festgewurzelte Minions (Nautilus) können angreifen, aber nicht laufen
  const step = minion.lhRootedUntil > lh.time ? 0 : LH.MINION_SPEED * LH.UNIT * dt;

  if (!minion.target) {
    lhFollowLane(minion, step);
    return;
  }

  if (lhEdgeDist(minion, minion.target) <= type.range * LH.UNIT) {
    minion.facing = Math.atan2(minion.target.y - minion.y, minion.target.x - minion.x);
    if (minion.windup > 0) {
      minion.windup -= dt;
      if (minion.windup <= 0) {
        minion.windup = 0;
        lhMinionFire(minion);
      }
    } else if (minion.cooldown <= 0) {
      minion.windup = type.windup;
      minion.cooldown = 1 / type.attackSpeed;
      if (!type.missile) minion.swing = lhStartSwing(minion.target, type.windup);
    }
  } else {
    minion.windup = 0;
    lhMoveToward(minion, minion.target.x, minion.target.y, step);
  }
}

// -----------------------------------------------------------------------------
// Türme
// -----------------------------------------------------------------------------
function lhTurretChoose(turret) {
  const reach = TURRET.range * LH.UNIT;
  const minions = lh.minions
    .filter((m) => m.alive && m.team !== turret.team && lhEdgeDist(turret, m) <= reach)
    .sort((a, b) => (TURRET.minionPriority[a.type] - TURRET.minionPriority[b.type]) || (lhDist(turret, a) - lhDist(turret, b)));
  if (minions.length) return minions[0];
  if (turret.team === 'red' && LH_PLAYER.alive && lhEdgeDist(turret, LH_PLAYER) <= reach) return LH_PLAYER;
  return null;
}

function lhUpdateTurret(turret, dt) {
  const reach = TURRET.range * LH.UNIT;
  // Ziel behalten, bis es stirbt oder die Reichweite verlässt
  if (turret.target && (!lhUnitAlive(turret.target) || lhEdgeDist(turret, turret.target) > reach)) {
    turret.target = null;
    turret.heatHits = 0;
  }
  if (!turret.target) {
    turret.target = lhTurretChoose(turret);
    turret.heatHits = 0;
  }

  turret.cooldown -= dt;
  if (!turret.target || turret.cooldown > 0) return;
  turret.cooldown = 1 / TURRET.attackSpeed;

  const target = turret.target;
  let damage = 0;
  if (target.kind === 'minion') {
    damage = lhMitigate(MINION_TYPES[target.type].turretShare * target.maxHp, target.armor);
  } else if (target.kind === 'player') {
    const heat = 1 + Math.min(TURRET.heatMax, TURRET.heatStep * turret.heatHits);
    damage = lhMitigate(lhTurretDamage(lh.time) * heat, lh.stats.armor);
    turret.heatHits += 1;
  }

  lhMissile(turret.x, turret.y - turret.radius * 0.6, target, TURRET.missile * LH.UNIT, () => {
    lhDamage(target, damage, turret);
  }, { color: turret.team === 'blue' ? '#93c5fd' : '#fca5a5', size: 4.2, glow: true });
}

// -----------------------------------------------------------------------------
// Champion (deine Figur)
// -----------------------------------------------------------------------------
function lhGainXp(amount) {
  lh.xp += amount;
  while (lh.level < 18 && lh.xp >= LH.XP_TO_LEVEL[lh.level - 1]) {
    lh.xp -= LH.XP_TO_LEVEL[lh.level - 1];
    lh.level += 1;
    const before = lh.stats;
    lh.stats = lhChampStats(lh.level);
    lh.hp += lh.stats.maxHp - before.maxHp; // wie in LoL steigt das aktuelle Leben mit
    lhFloat(player.x, player.y - player.radius - 10, `Level ${lh.level}`, '#5eead4', 1.4);
  }
}

// -----------------------------------------------------------------------------
// Nahkampf-Animation: Ausholen, Vorstoßen und ein Hieb-Effekt am Ziel.
// Nur Darstellung, die echte Position und die Trefferberechnung bleiben unverändert.
// -----------------------------------------------------------------------------
function lhStartSwing(target, duration) {
  return { start: lh.time, duration: Math.max(0.05, duration), target };
}

// Verschiebung in Richtung Ziel: erst ausholen (zurück), dann vorstoßen, danach zurückfedern
function lhSwingOffset(swing, reach) {
  if (!swing) return 0;
  if (swing.hitAt === undefined) {
    const p = Math.min(1, (lh.time - swing.start) / swing.duration);
    return p < 0.6 ? -reach * 0.4 * (p / 0.6) : -reach * 0.4 + reach * 1.4 * ((p - 0.6) / 0.4);
  }
  const back = (lh.time - swing.hitAt) / 0.14;
  return back >= 1 ? 0 : reach * (1 - back);
}

function lhSwingVector(unit, swing, reach) {
  if (!swing || !swing.target) return { x: 0, y: 0 };
  const offset = lhSwingOffset(swing, reach);
  const angle = Math.atan2(swing.target.y - unit.y, swing.target.x - unit.x);
  return { x: Math.cos(angle) * offset, y: Math.sin(angle) * offset };
}

// Hieb am Ziel: Sichel auf der Seite, die dem Angreifer zugewandt ist
function lhSlash(target, attacker, color, strong) {
  lh.slashes.push({
    x: target.x,
    y: target.y,
    angle: Math.atan2(attacker.y - target.y, attacker.x - target.x),
    radius: target.radius + (strong ? 4 : 2.5),
    color,
    width: strong ? 2.6 : 1.6,
    life: strong ? 0.2 : 0.16,
    maxLife: strong ? 0.2 : 0.16,
    alpha: strong ? 1 : 0.75,
  });
}

function lhUpdateSlashes(dt) {
  for (let i = lh.slashes.length - 1; i >= 0; i -= 1) {
    lh.slashes[i].life -= dt;
    if (lh.slashes[i].life <= 0) lh.slashes.splice(i, 1);
  }
  // abgebrochene Schläge (Ziel weg oder Animation abgebrochen) zurücksetzen
  if (lh.playerSwing && lh.playerSwing.hitAt === undefined && lh.windup <= 0) lh.playerSwing = null;
  if (lh.playerSwing && lh.playerSwing.hitAt !== undefined && lh.time - lh.playerSwing.hitAt > 0.2) lh.playerSwing = null;
  for (const minion of lh.minions) {
    const swing = minion.swing;
    if (!swing) continue;
    if ((swing.hitAt === undefined && minion.windup <= 0) || (swing.hitAt !== undefined && lh.time - swing.hitAt > 0.2)) minion.swing = null;
  }
}

function lhDrawSlashes() {
  for (const slash of lh.slashes) {
    const progress = 1 - slash.life / slash.maxLife; // 0 -> 1
    // Der Bogen läuft quer über das Ziel: sein Mittelpunkt liegt auf der Seite des Angreifers
    const bend = slash.radius * 1.9;
    const cx = slash.x + Math.cos(slash.angle) * bend * 0.85;
    const cy = slash.y + Math.sin(slash.angle) * bend * 0.85;
    const base = slash.angle + Math.PI;
    const spread = 0.7;
    // in den ersten 40 % wird der Hieb "gezogen", danach blendet er aus
    const drawn = Math.min(1, progress / 0.4);
    const from = base - spread;
    const to = from + spread * 2 * drawn;
    const fade = progress < 0.4 ? 1 : 1 - (progress - 0.4) / 0.6;
    ctx.save();
    ctx.globalAlpha = slash.alpha * Math.max(0, fade);
    ctx.lineCap = 'round';
    ctx.shadowColor = slash.color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = slash.color;
    ctx.lineWidth = slash.width * 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, bend, from, to);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = slash.width * 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, bend, from + 0.12, to - 0.05);
    ctx.stroke();
    ctx.restore();
  }
}

function lhCancelAttack() {
  // Wie in LoL: im letzten Tick (0,033 s) vor dem Treffer lässt sich der Angriff nicht mehr abbrechen
  if (lh.windup > 0 && lh.windup <= 0.033 && lh.attackTarget) {
    lh.cancelAfterFire = true;
    return;
  }
  lh.attackTarget = null;
  lh.windup = 0; // Angriffsanimation abbrechen
}

// Klick in der Arena: nächster gegnerischer Minion unter dem Cursor wird angegriffen
function lhPointerCommand(world) {
  let best = null;
  let bestDistance = Infinity;
  for (const minion of lh.minions) {
    if (!minion.alive || minion.team !== 'red') continue;
    const distance = Math.hypot(minion.x - world.x, minion.y - world.y);
    if (distance <= minion.radius + LH.CLICK_TOLERANCE && distance < bestDistance) {
      best = minion;
      bestDistance = distance;
    }
  }
  if (!best) return false;

  if (lh.attackTarget !== best) {
    lh.attackTarget = best;
    lh.windup = 0;
  }
  lh.chaseTimer = 0;
  lh.holdAttack = true;
  return true;
}

// Steht die Figur hinter dem Ziel? (hintere Hälfte relativ zur Blickrichtung des Minions)
function lhIsBehind(target) {
  if (target.facing === undefined) return false;
  const toPlayer = Math.atan2(player.y - target.y, player.x - target.x);
  let diff = toPlayer - target.facing;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) > Math.PI / 2;
}

// Ein Auto-Angriff: Passiv-Effekte werden beim Abfeuern bestimmt (Stapel, Aufladung),
// der Schaden selbst beim Einschlag (z. B. fehlendes Leben des Ziels).
function lhPlayerAttackPackage(target) {
  const passive = LH_PASSIVES[lh.champ.id];
  const bonus = passive ? passive.onAttack(lh.passiveState, target, lh.level) || {} : {};
  return { ad: lh.stats.ad, bonus };
}

// Angriffsschaden selbst: physisch, bei Yone teils magisch, bei Krit multipliziert
function lhBaseAttackDamage(target, attack) {
  const bonus = attack.bonus;
  const total = attack.ad * (bonus.critMultiplier === undefined ? 1 : bonus.critMultiplier); // 0 erlaubt (Zeri)
  const magicShare = bonus.adMagicShare || 0;
  return lhMitigate(total * (1 - magicShare), target.armor) + lhMitigate(total * magicShare, target.mr || 0);
}

function lhApplyAttack(target, attack) {
  if (!lhUnitAlive(target)) return;
  const bonus = attack.bonus;
  let damage = lhBaseAttackDamage(target, attack);
  if (bonus.physical) damage += lhMitigate(bonus.physical, target.armor);
  if (bonus.missingHealthPhysical) damage += lhMitigate(bonus.missingHealthPhysical * (target.maxHp - target.hp), target.armor);
  if (bonus.magic) damage += lhMitigate(bonus.magic, target.mr || 0);
  if (bonus.missingHealthMagic) damage += lhMitigate(bonus.missingHealthMagic * (target.maxHp - target.hp), target.mr || 0);
  if (bonus.true) damage += bonus.true;
  if (bonus.onHit) bonus.onHit(target);
  if (bonus.dot) lhAddDot(target, bonus.dot);
  if (bonus.impactMagic) damage += lhMitigate(bonus.impactMagic(target), target.mr || 0);
  if (bonus.impactPhysical) damage += lhMitigate(bonus.impactPhysical(target, target.hp), target.armor);
  if (bonus.behindPhysical && lhIsBehind(target)) damage += lhMitigate(bonus.behindPhysical, target.armor);
  if (bonus.chain) damage += lhMitigate(bonus.chain.magic, target.mr || 0);

  // Flächenschaden trifft auch andere gegnerische Minions in der Nähe (jeder Kill zählt als CS)
  if (bonus.cleave) {
    const cleave = bonus.cleave;
    const radius = cleave.radius * LH.UNIT;
    const inArea = (m) => {
      if (cleave.cone) {
        // Kegel von der Figur aus in Angriffsrichtung
        if (lhDist(m, player) > radius + m.radius) return false;
        let diff = Math.atan2(m.y - player.y, m.x - player.x) - cleave.cone.angle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        return Math.abs(diff) <= cleave.cone.width / 2;
      }
      return lhDist(m, target) <= radius + m.radius;
    };
    const others = lh.minions.filter((m) => m.alive && m.team === 'red' && m !== target && inArea(m));
    for (const other of others) {
      let splash = 0;
      if (cleave.magic) splash += lhMitigate(cleave.magic, other.mr || 0);
      if (cleave.physical) splash += lhMitigate(cleave.physical, other.armor);
      if (cleave.physicalFn) splash += lhMitigate(cleave.physicalFn(other), other.armor);
      lhDamage(other, splash, LH_PLAYER);
    }
    // Das Hauptziel erhält den magischen Flächenschaden mit (Diana); physische Anteile stecken bereits im Angriff
    if (cleave.magic) damage += lhMitigate(cleave.magic, target.mr || 0);
  }

  if (bonus.heal) lh.hp = Math.min(lh.stats.maxHp, lh.hp + bonus.heal);

  // Schrotkugeln an anderen Minions (Graves)
  if (bonus.splashHits) {
    for (const hit of bonus.splashHits) {
      if (hit.unit.alive) lhDamage(hit.unit, lhMitigate(hit.physical, hit.unit.armor), LH_PLAYER);
    }
  }

  // Hinrichtung unter einer Lebensgrenze (Zeri)
  if (bonus.executeBelow && target.hp - damage < bonus.executeBelow) damage = Math.max(damage, target.hp);

  lhDamage(target, damage, LH_PLAYER);

  // Blitzkette (Volibear): springt vom Ziel zum jeweils nächsten Minion in Reichweite
  if (bonus.chain) {
    const hit = new Set([target]);
    let from = target;
    for (let jump = 0; jump < bonus.chain.jumps; jump += 1) {
      const next = lh.minions
        .filter((m) => m.alive && m.team === 'red' && !hit.has(m) && lhDist(m, from) <= bonus.chain.range * LH.UNIT)
        .sort((a, b) => lhDist(a, from) - lhDist(b, from))[0];
      if (!next) break;
      hit.add(next);
      lhDamage(next, lhMitigate(bonus.chain.magic, next.mr || 0), LH_PLAYER);
      from = next;
    }
  }
}

// Kompatibilität (wird in Tests genutzt): sofortiger Schaden eines Angriffs ohne Flugzeit
function lhPlayerAttackDamage(target) {
  const attack = lhPlayerAttackPackage(target);
  const bonus = attack.bonus;
  let damage = lhBaseAttackDamage(target, attack);
  if (bonus.physical) damage += lhMitigate(bonus.physical, target.armor);
  if (bonus.missingHealthPhysical) damage += lhMitigate(bonus.missingHealthPhysical * (target.maxHp - target.hp), target.armor);
  if (bonus.magic) damage += lhMitigate(bonus.magic, target.mr || 0);
  if (bonus.missingHealthMagic) damage += lhMitigate(bonus.missingHealthMagic * (target.maxHp - target.hp), target.mr || 0);
  if (bonus.true) damage += bonus.true;
  if (bonus.cleave) damage += lhMitigate(bonus.cleave.magic, target.mr || 0);
  if (bonus.onHit) bonus.onHit(target);
  if (bonus.dot) lhAddDot(target, bonus.dot);
  if (bonus.impactMagic) damage += lhMitigate(bonus.impactMagic(target), target.mr || 0);
  if (bonus.impactPhysical) damage += lhMitigate(bonus.impactPhysical(target, target.hp), target.armor);
  if (bonus.behindPhysical && lhIsBehind(target)) damage += lhMitigate(bonus.behindPhysical, target.armor);
  if (bonus.chain) damage += lhMitigate(bonus.chain.magic, target.mr || 0);
  return damage;
}

function lhLaunch(target, attack) {
  if (lhIsMelee()) {
    lhSlash(target, player, '#e0f2fe', true);
    if (lh.playerSwing) lh.playerSwing.hitAt = lh.time;
    else lh.playerSwing = { start: lh.time, duration: 0.05, target, hitAt: lh.time }; // z. B. zweiter Schlag
    lhApplyAttack(target, attack);
    return;
  }
  // Fernkämpfer ohne Geschoss (z. B. Zeri, Senna, Thresh): Treffer sofort, sichtbar als kurzer Strahl
  if (lhAttackInfo().missile === 0) {
    lh.beams.push({ x1: player.x, y1: player.y, target, life: 0.12, maxLife: 0.12 });
    lhApplyAttack(target, attack);
    return;
  }
  lhMissile(player.x, player.y, target, lhProjectileSpeed(), () => lhApplyAttack(target, attack), {
    color: '#5eead4',
    size: 2.6,
    glow: true,
  });
}

function lhUpdateBeams(dt) {
  for (let i = lh.beams.length - 1; i >= 0; i -= 1) {
    lh.beams[i].life -= dt;
    if (lh.beams[i].life <= 0) lh.beams.splice(i, 1);
  }
}

function lhDrawBeams() {
  for (const beam of lh.beams) {
    const fade = beam.life / beam.maxLife;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = '#a5f3fc';
    ctx.shadowColor = '#5eead4';
    ctx.shadowBlur = 8;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.2 * fade + 0.6;
    ctx.beginPath();
    ctx.moveTo(beam.x1, beam.y1);
    ctx.lineTo(beam.target.x, beam.target.y);
    ctx.stroke();
    ctx.restore();
  }
}

function lhPlayerFire(target) {
  lh.attackingRecently = 2;
  const attack = lhPlayerAttackPackage(target);
  lhLaunch(target, attack);

  // Zeitversetzte Zusatztreffer (Lulus Pix): eigener Treffer, kann den Last Hit holen
  if (attack.bonus.extraHits) {
    for (const hit of attack.bonus.extraHits) {
      lh.delayed.push({
        time: lh.time + hit.delay,
        run: () => {
          if (lhUnitAlive(target)) lhDamage(target, lhMitigate(hit.magic, target.mr || 0), LH_PLAYER);
        },
      });
    }
  }

  // Nachladen o. Ä.: nächster Angriff frühestens nach dieser Zeit
  if (attack.bonus.cooldownOverride) {
    lh.attackCooldown = Math.max(lh.attackCooldown, attack.bonus.cooldownOverride);
  }

  // Zweiter Schuss (z. B. Akshan): eigener Treffer nach kurzer Verzögerung
  if (attack.bonus.secondShot) {
    const shot = attack.bonus.secondShot;
    lh.delayed.push({
      time: lh.time + shot.delay,
      run: () => {
        let shotTarget = target;
        if (!lhUnitAlive(shotTarget) && shot.retarget) {
          const range = lh.stats.range * LH.UNIT;
          shotTarget = lh.minions
            .filter((m) => m.alive && m.team === 'red' && lhEdgeDist(LH_PLAYER, m) <= range)
            .sort((a, b) => lhDist(LH_PLAYER, a) - lhDist(LH_PLAYER, b))[0];
        }
        if (shotTarget) lhLaunch(shotTarget, { ad: lh.stats.ad * shot.adRatio, bonus: {} });
      },
    });
  }
}

function lhUpdatePlayerAttack(dt) {
  lh.attackCooldown -= dt;
  lh.attackingRecently -= dt;

  const target = lh.attackTarget;
  if (!target || !target.alive) {
    lh.attackTarget = null;
    lh.windup = 0;
    return;
  }

  const passiveNow = LH_PASSIVES[lh.champ.id];
  const rangeBonus = passiveNow && passiveNow.rangeBonus ? passiveNow.rangeBonus(lh.passiveState) : 0;
  const range = (lh.stats.range + rangeBonus) * LH.UNIT;
  if (lhEdgeDist(LH_PLAYER, target) <= range) {
    if (player.path.length && !lh.cancelAfterFire) stopMoving(); // Laufbefehl aus der Abbruch-Sperre nicht verwerfen
    player.facing = Math.atan2(target.y - player.y, target.x - player.x);

    if (lh.windup > 0) {
      lh.windup -= dt;
      if (lh.windup <= 0) {
        lh.windup = 0;
        lhPlayerFire(target);
        if (lh.cancelAfterFire) {
          // Bewegungsbefehl aus dem letzten Tick jetzt ausführen
          lh.cancelAfterFire = false;
          lh.attackTarget = null;
        }
      }
    } else if (lh.attackCooldown <= 0) {
      const passive = LH_PASSIVES[lh.champ.id];
      const scale = passive && passive.attackTimeScale ? passive.attackTimeScale(lh.passiveState) : 1;
      const extraAs = passive && passive.attackSpeedBonus ? passive.attackSpeedBonus(lh.passiveState) : 0;
      const attackSpeed = lh.stats.attackSpeed + ((lh.champ.stats.attackspeed || 0.65) * extraAs) / 100;
      const interval = (1 / attackSpeed) * scale;
      const info = lhAttackInfo();
      const baseWindup = info.windup / (lh.champ.stats.attackspeed || 0.65);
      lh.windup = Math.max(0.01, baseWindup + (info.windup * interval - baseWindup) * info.windupModifier);
      if (lhIsMelee()) lh.playerSwing = lhStartSwing(target, lh.windup);
      lh.attackCooldown = interval;
    }
    return;
  }

  // Außer Reichweite: hinlaufen (Weg wird regelmäßig neu berechnet)
  lh.windup = 0;
  lh.chaseTimer -= dt;
  if (lh.chaseTimer <= 0) {
    lh.chaseTimer = 0.15;
    setMoveTarget(target.x, target.y);
  }
}

// -----------------------------------------------------------------------------
// Geschosse und schwebende Texte
// -----------------------------------------------------------------------------
function lhUpdateMissiles(dt) {
  for (let i = lh.missiles.length - 1; i >= 0; i -= 1) {
    const missile = lh.missiles[i];
    const target = missile.target;
    // Stirbt das Ziel vorher, verpufft das Geschoss
    if (!lhUnitAlive(target)) {
      lh.missiles.splice(i, 1);
      continue;
    }
    const distance = Math.hypot(target.x - missile.x, target.y - missile.y);
    const step = missile.speed * dt;
    if (distance <= step + target.radius * 0.5) {
      lh.missiles.splice(i, 1);
      missile.impact();
      continue;
    }
    missile.x += ((target.x - missile.x) / distance) * step;
    missile.y += ((target.y - missile.y) / distance) * step;
  }
}

function lhUpdateFloats(dt) {
  for (let i = lh.floats.length - 1; i >= 0; i -= 1) {
    const float = lh.floats[i];
    float.life -= dt;
    float.y -= 14 * dt;
    if (float.life <= 0) lh.floats.splice(i, 1);
  }
}

// -----------------------------------------------------------------------------
// Ablauf eines Runs
// -----------------------------------------------------------------------------
function startLastHit() {
  const champ = findChampion(selectedChampion);
  if (!champ || !champ.stats) {
    openChampSelect();
    return;
  }

  if (nameInput) nameInput.value = sanitizeName(nameInput.value);

  gameMode = 'lasthit';
  setHudMode('lasthit');
  resetGame(); // räumt Dodge-Reste auf (Projektile, Partikel, Position)

  lh.champ = champ;
  lh.level = 1;
  lh.xp = 0;
  lh.stats = lhChampStats(1);
  lh.hp = lh.stats.maxHp;
  lh.time = LH.CLOCK_START;
  lh.minions = [];
  lh.missiles = [];
  lh.floats = [];
  lh.slashes = [];
  lh.beams = [];
  lh.playerSwing = null;
  lh.waves = lhSelectedWaves();
  lh.perfect = lhPerfectFor(lh.waves);
  lh.queue = lhBuildQueue(lh.waves);
  lh.hardEnd = lh.queue[lh.queue.length - 1].time + LH.END_GRACE;
  lh.cs = 0;
  lh.possible = 0;
  lh.missed = 0;
  lh.attackTarget = null;
  lh.attackCooldown = 0;
  lh.windup = 0;
  lh.chaseTimer = 0;
  lh.attackingRecently = 0;
  lh.holdAttack = false;
  lh.passiveState = {};
  lh.cancelAfterFire = false;
  lh.delayed = [];
  lh.endReason = '';
  lh.over = false;
  lh.running = true;

  lh.turrets = ['blue', 'red'].map((team) => ({
    kind: 'turret',
    team,
    x: LH_TURRET_MAP[team][0] * LH_MAP_X,
    y: LH_TURRET_MAP[team][1] * LH_MAP_Y,
    radius: TURRET.radius * LH.UNIT,
    target: null,
    cooldown: 0,
    heatHits: 0,
  }));

  // Figur in echten Proportionen, Start vor dem eigenen Turm in der Lane
  player.radius = lhAttackInfo().radius * LH.UNIT;
  player.speed = lh.stats.speed * LH.UNIT;
  const start = nearestReachablePoint(LH_PATH[3].x + 30, LH_PATH[3].y - 20);
  player.x = start.x;
  player.y = start.y;
  player.facing = Math.atan2(LH_PATH[4].y - LH_PATH[3].y, LH_PATH[4].x - LH_PATH[3].x);
  stopMoving();

  hasStarted = true;
  gameOver = false;
  menuEl.hidden = true;
  champEl.hidden = true;
  panelEl.hidden = true;
  lhResultEl.hidden = true;
  overlay.classList.add('hidden');
  saveLastMode('lasthit');

  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  lastTime = 0;
  animationFrameId = requestAnimationFrame(gameLoop);
  lhUpdateHUD();
}

function lhStop() {
  lh.running = false;
  lh.over = false;
  lh.delayed = [];
  lh.minions = [];
  lh.missiles = [];
  lh.floats = [];
  lh.slashes = [];
  lh.playerSwing = null;
}

function lastHitStep(dt) {
  if (!lh.running) return;

  lh.time += dt;
  // Sicherheitsgrenze, falls eine Welle hängen bleibt
  if (lh.time >= lh.hardEnd) {
    lhEnd('time');
    return;
  }

  while (lh.queue.length && lh.queue[0].time <= lh.time) lhSpawn(lh.queue.shift());

  handleInput(dt); // Bewegung der Figur (Wegfindung, Wände)
  lhUpdatePlayerAttack(dt);

  const passiveTick = LH_PASSIVES[lh.champ.id];
  if (passiveTick && passiveTick.onUpdate) passiveTick.onUpdate(lh.passiveState, dt);

  for (let i = lh.delayed.length - 1; i >= 0; i -= 1) {
    if (lh.delayed[i].time <= lh.time) {
      const action = lh.delayed[i];
      lh.delayed.splice(i, 1);
      action.run();
    }
  }

  for (const minion of lh.minions) {
    if (minion.alive) lhUpdateMinion(minion, dt);
    if (!lh.running) return;
  }
  for (const turret of lh.turrets) lhUpdateTurret(turret, dt);
  lhUpdateMissiles(dt);
  lhUpdateDots();
  if (!lh.running) return;

  lhSeparate();
  pushOutOfWalls(player);
  lh.minions = lh.minions.filter((m) => m.alive);
  if (!lh.queue.some((e) => e.team === 'red') && !lh.minions.some((m) => m.team === 'red')) {
    lhEnd('done'); // alle gegnerischen Minions der gewählten Wellen sind gestorben
    return;
  }

  lh.hp = Math.min(lh.stats.maxHp, lh.hp + lh.stats.regen * dt);

  updateParticles(dt);
  lhUpdateFloats(dt);
  lhUpdateSlashes(dt);
  lhUpdateBeams(dt);
  lhUpdateHUD();
}

function lhUpdateHUD() {
  scoreEl.textContent = `${lh.cs}/${lh.possible}`;
  healthEl.textContent = String(Math.ceil(lh.hp));
  levelEl.textContent = String(lh.level);
  document.getElementById('clock').textContent = lhFormatClock(lh.time);
}

// -----------------------------------------------------------------------------
// Ende und Bestenliste
// -----------------------------------------------------------------------------
function lhReadBoard() {
  try {
    const parsed = JSON.parse(localStorage.getItem(lhBoardKey) || '[]');
    return Array.isArray(parsed)
      ? parsed
          .filter((e) => e && Number.isFinite(Number(e.cs)) && Number.isInteger(Number(e.waves)))
          .map((e) => ({ name: sanitizeName(e.name), champ: String(e.champ || ''), champId: String(e.champId || e.champ || ''), cs: Math.floor(Number(e.cs)), died: Boolean(e.died), waves: Number(e.waves), at: Number(e.at) || 0 }))
      : [];
  } catch (error) {
    return [];
  }
}

function lhSaveBoard(board) {
  try {
    localStorage.setItem(lhBoardKey, JSON.stringify(board));
  } catch (error) {
    // nicht speicherbar: Bestenliste gilt nur für diese Sitzung
  }
}

let lhBoardMode = 'champ'; // 'champ' = nur der aktuelle Champion, 'all' = alle Champions

// Beste Einträge einer Wellenzahl, optional nur für einen Champion
function lhBoardFor(waves, champId = null) {
  return lhReadBoard()
    .filter((e) => e.waves === waves && (!champId || e.champId === champId))
    .sort((a, b) => b.cs - a.cs || a.at - b.at)
    .slice(0, LH_BOARD_SIZE);
}

// Gespeichert werden je Wellenzahl und Champion die besten 5; "Alle" ergibt sich daraus
function lhSubmit() {
  const all = lhReadBoard();
  const entry = {
    name: sanitizeName(nameInput.value),
    champ: lh.champ.name,
    champId: lh.champ.id,
    cs: lh.cs,
    died: lh.endReason === 'dead',
    waves: lh.waves,
    at: Date.now(),
  };
  const sameGroup = (e) => e.waves === lh.waves && e.champId === lh.champ.id;
  const group = [...all.filter(sameGroup), entry].sort((x, y) => y.cs - x.cs || x.at - y.at).slice(0, LH_BOARD_SIZE);
  lhSaveBoard([...all.filter((e) => !sameGroup(e)), ...group]);

  lh.lastEntryAt = entry.at;
  lh.champRank = lhBoardFor(lh.waves, lh.champ.id).findIndex((e) => e.at === entry.at) + 1;
  lh.overallRank = lhBoardFor(lh.waves).findIndex((e) => e.at === entry.at) + 1;
  return lh.champRank;
}

function lhEnd(reason) {
  if (!lh.running) return;
  lh.running = false;
  lh.over = true;
  lh.endReason = reason;
  gameOver = true;
  lhCancelAttack();
  stopMoving();
  lh.lastRank = lhSubmit();
  lhUpdateHUD(); // HUD zeigt den Endstand (z. B. 0 HP nach dem Tod)
  lhShowResult();
}

function lhRenderBoard() {
  const list = document.getElementById('lhBoard');
  const waves = lh.over ? lh.waves : lhSelectedWaves();
  const champ = lh.champ || findChampion(selectedChampion);
  const board = lhBoardFor(waves, lhBoardMode === 'champ' && champ ? champ.id : null);
  document.getElementById('lhBoardTitle').textContent = `Bestenliste · ${waves} ${waves === 1 ? 'Welle' : 'Wellen'}`;
  document.getElementById('lhBoardChamp').textContent = champ ? champ.name : 'Champion';
  document.querySelectorAll('#lhBoardMode button').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === lhBoardMode);
  });
  list.replaceChildren();

  if (!board.length) {
    const item = document.createElement('li');
    item.className = 'empty';
    item.textContent = 'Noch keine Einträge';
    list.append(item);
    return;
  }

  board.forEach((entry, index) => {
    const item = document.createElement('li');
    if (lh.over && entry.at === lh.lastEntryAt) item.className = 'me';
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = String(index + 1);
    const name = document.createElement('span');
    name.className = 'entry-name';
    name.textContent = entry.name;
    const champ = document.createElement('small');
    champ.className = 'entry-champ';
    champ.textContent = entry.champ;
    name.append(document.createElement('br'), champ);
    const points = document.createElement('span');
    points.className = 'entry-score';
    points.textContent = `${entry.cs} CS${entry.died ? ' †' : ''}`;
    item.append(rank, name, points);
    list.append(item);
  });
}

function lhShowResult() {
  const died = lh.endReason === 'dead';
  const eyebrow = died ? `Gestorben bei ${lhFormatClock(lh.time)}` : lh.endReason === 'done' ? 'Alle Wellen geschafft' : 'Zeit abgelaufen';
  document.getElementById('lhResultEyebrow').textContent = eyebrow;
  document.getElementById('lhResultCs').textContent = `${lh.cs} / ${lh.perfect}`;
  document.getElementById('lhResultLabel').textContent = `${lh.waves} ${lh.waves === 1 ? 'Welle' : 'Wellen'} · ${lh.champ.name}`;
  document.getElementById('lhResultPct').textContent = `${Math.round((lh.cs / lh.perfect) * 100)} %`;
  document.getElementById('lhResultMissed').textContent = String(lh.missed);
  document.getElementById('lhResultLevel').textContent = String(lh.level);
  document.getElementById('lhResultTime').textContent = lhFormatClock(lh.time);

  const badge = document.getElementById('lhResultBadge');
  if (lh.overallRank === 1 && lh.cs > 0) badge.textContent = 'Neuer Gesamtrekord';
  else if (lh.champRank === 1 && lh.cs > 0) badge.textContent = `Neuer Rekord mit ${lh.champ.name}`;
  else if (lh.champRank > 0) badge.textContent = `Platz ${lh.champRank} mit ${lh.champ.name}`;
  else badge.textContent = 'Nicht in den Top 5';
  badge.classList.toggle('muted', lh.champRank === 0);

  lhRenderBoard();
  menuEl.hidden = true;
  champEl.hidden = true;
  panelEl.hidden = true;
  lhResultEl.hidden = false;
  overlay.classList.remove('hidden');
  document.getElementById('lhAgain').focus({ preventScroll: true });
}

// Startseite: Bestwert auf der Last-Hit-Karte
function lhRenderCard() {
  const badge = document.getElementById('lhBadge');
  const waves = lhSelectedWaves();
  const champ = findChampion(selectedChampion);
  const best = lhBoardFor(waves, champ ? champ.id : null)[0];
  badge.textContent = best ? `Bestwert ${best.cs} / ${lhPerfectFor(waves)}` : 'Neu';
  badge.classList.toggle('muted', !best);
}

// -----------------------------------------------------------------------------
// Zeichnen
// -----------------------------------------------------------------------------
function lhDrawTurretRanges() {
  for (const turret of lh.turrets) {
    const reach = TURRET.range * LH.UNIT + turret.radius;
    const near = lhDist(turret, player) - player.radius <= reach + 60;
    const aggro = turret.target === LH_PLAYER;
    if (!showWalls && !(turret.team === 'red' && (near || aggro))) continue;

    ctx.save();
    ctx.strokeStyle = turret.team === 'red' ? 'rgba(248, 113, 113, 0.55)' : 'rgba(96, 165, 250, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(turret.x, turret.y, reach, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Roter Strich: der Turm zielt auf dich
    if (aggro) {
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(turret.x, turret.y - turret.radius * 0.6);
      ctx.lineTo(player.x, player.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function lhDrawHealthBar(x, y, width, fraction, color) {
  const height = 2.6;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(x - width / 2 - 0.6, y - 0.6, width + 1.2, height + 1.2);
  ctx.fillStyle = color;
  ctx.fillRect(x - width / 2, y, width * Math.max(0, Math.min(1, fraction)), height);
}

function lhDrawMinions() {
  const sorted = [...lh.minions].sort((a, b) => a.y - b.y);
  for (const minion of sorted) {
    const colors = LH_COLORS[minion.team];
    const r = minion.radius;

    // Melee-Minions holen beim Angriff aus und stoßen vor (nur Darstellung)
    const lunge = lhSwingVector(minion, minion.swing, r * 0.45);
    const mx = minion.x + lunge.x;
    const my = minion.y + lunge.y;

    ctx.save();
    ctx.globalAlpha = minion.ghostUntil > lh.time ? 0.75 : 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(mx, my + r * 0.55, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.body;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (minion.type === 'siege') {
      const s = r * 0.9;
      ctx.roundRect(mx - s, my - s, s * 2, s * 2, 3);
    } else {
      ctx.arc(mx, my, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    // Caster: heller Kern zur Unterscheidung
    if (minion.type === 'caster') {
      ctx.fillStyle = colors.light;
      ctx.beginPath();
      ctx.arc(mx, my, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Valors Markierung (Quinn)
    if (minion.lhQuinnMarkUntil > lh.time) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(minion.x, minion.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Ausgewähltes Angriffsziel markieren
    if (lh.attackTarget === minion) {
      ctx.save();
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.arc(minion.x, minion.y, r + 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Balken so breit wie der Minion, damit sich Balken von Nachbarn nicht überlappen
    lhDrawHealthBar(minion.x, minion.y - r - 5, r * 2, minion.hp / minion.maxHp, colors.bar);
  }
}

function lhDrawMissiles() {
  for (const missile of lh.missiles) {
    ctx.save();
    if (missile.glow) {
      ctx.shadowColor = missile.color;
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = missile.color;
    ctx.beginPath();
    ctx.arc(missile.x, missile.y, missile.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function lhDrawPlayerBar() {
  if (!lh.stats) return;
  const width = Math.max(22, player.radius * 2.6);
  const y = player.y - player.radius - 9;
  lhDrawHealthBar(player.x, y, width, lh.hp / lh.stats.maxHp, '#4ade80');
  const passiveBar = LH_PASSIVES[lh.champ.id];
  if (passiveBar && passiveBar.resourceBar) {
    lhDrawHealthBar(player.x, y + 3.6, width, passiveBar.resourceBar(lh.passiveState), '#facc15');
  }
  ctx.save();
  ctx.font = 'bold 6px Inter, "Segoe UI", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(String(lh.level), player.x - width / 2 - 2, y + 3);
  ctx.restore();
}

function lhDrawFloats() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 8px Inter, "Segoe UI", sans-serif';
  for (const float of lh.floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, float.life / float.maxLife + 0.2));
    ctx.fillStyle = float.color;
    ctx.fillText(float.text, float.x, float.y);
  }
  ctx.restore();
}

// Debug (Taste H): Reichweiten und Ziele
function lhDrawDebug() {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.7)';
  ctx.beginPath();
  ctx.arc(player.x, player.y, lh.stats.range * LH.UNIT + player.radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
  ctx.beginPath();
  LH_PATH.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  for (const minion of lh.minions) {
    if (!minion.target) continue;
    ctx.beginPath();
    ctx.moveTo(minion.x, minion.y);
    ctx.lineTo(minion.target.x, minion.target.y);
    ctx.stroke();
  }
  ctx.restore();
}

function lastHitDraw() {
  drawBackground();
  if (showWalls) drawWalls();
  lhDrawTurretRanges();
  drawClickMarker();
  lhDrawMinions();
  lhDrawMissiles();
  drawParticles();
  // Nahkampf: Figur holt aus und stößt vor (nur Darstellung)
  const lunge = lhSwingVector(player, lh.playerSwing, player.radius * 0.45);
  player.x += lunge.x;
  player.y += lunge.y;
  drawPlayer();
  player.x -= lunge.x;
  player.y -= lunge.y;
  lhDrawSlashes();
  lhDrawBeams();
  lhDrawPlayerBar();
  lhDrawFloats();
  if (showWalls && lh.stats) lhDrawDebug();
  resetCamera();
}

// -----------------------------------------------------------------------------
// Bedienelemente
// -----------------------------------------------------------------------------
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => {
  canvas.addEventListener(name, () => {
    lh.holdAttack = false;
  });
});

document.getElementById('champStart').addEventListener('click', startLastHit);

// Wellenzahl in der Champion-Auswahl
function lhRenderWaves() {
  const waves = lhSelectedWaves();
  document.getElementById('wavesValue').textContent = String(waves);
  document.getElementById('wavesInfo').textContent = `Ziel ${lhPerfectFor(waves)} CS · Ende etwa ${lhFormatClock(lhEstimatedEnd(waves))}`;
  document.getElementById('wavesMinus').disabled = waves <= 1;
  document.getElementById('wavesPlus').disabled = waves >= LH.MAX_WAVES;
  if (typeof renderChampStatus === 'function') renderChampStatus();
  lhRenderCard();
}

function lhChangeWaves(delta) {
  lhSetSelectedWaves(lhSelectedWaves() + delta);
  lhRenderWaves();
}

document.getElementById('wavesMinus').addEventListener('click', () => lhChangeWaves(-1));
document.getElementById('wavesPlus').addEventListener('click', () => lhChangeWaves(1));
lhRenderWaves();
document.getElementById('lhAgain').addEventListener('click', startLastHit);
document.querySelectorAll('#lhBoardMode button').forEach((button) => {
  button.addEventListener('click', () => {
    lhBoardMode = button.dataset.mode;
    lhRenderBoard();
  });
});
document.getElementById('lhChangeChamp').addEventListener('click', openChampSelect);
document.getElementById('lhBack').addEventListener('click', showMenu);

lhRenderCard();
