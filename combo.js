(function attachComboSystem(global) {
  'use strict';

  const FOOD_RULES = Object.freeze({
    yellow: Object.freeze({
      basePoints: 10,
      comboSteps: 1,
      windowBonusMs: 0,
      label: 'Combo up!',
    }),
    purple: Object.freeze({
      basePoints: 25,
      comboSteps: 2,
      windowBonusMs: 600,
      label: 'Purple boost!',
    }),
    bonus: Object.freeze({
      basePoints: 50,
      comboSteps: 1,
      windowBonusMs: 1200,
      label: 'Bonus time!',
    }),
    green: Object.freeze({
      basePoints: 50,
      comboSteps: 1,
      windowBonusMs: 1200,
      label: 'Bonus time!',
    }),
  });

  const DEFAULT_WINDOW_MS = 3200;
  const DEFAULT_MAX_MULTIPLIER = 5;

  function defaultClock() {
    if (global.performance && typeof global.performance.now === 'function') {
      return global.performance.now();
    }
    return Date.now();
  }

  function normalizeTime(value, fallback) {
    return Number.isFinite(value) ? value : fallback();
  }

  function normalizeFoodType(type) {
    const normalized = String(type || 'yellow').toLowerCase();
    return Object.prototype.hasOwnProperty.call(FOOD_RULES, normalized)
      ? normalized
      : 'yellow';
  }

  /**
   * A small, dependency-free combo engine with an optional accessible HUD.
   *
   * @example
   * const combo = new window.ComboSystem({ host: '.board-wrap' });
   * combo.reset(performance.now());
   * const award = combo.registerFood('purple', 25, performance.now());
   * score += award.totalPoints;
   */
  class ComboSystem {
    constructor(options = {}) {
      this.windowMs = Math.max(500, Number(options.windowMs) || DEFAULT_WINDOW_MS);
      this.maxMultiplier = Math.max(
        1,
        Math.floor(Number(options.maxMultiplier) || DEFAULT_MAX_MULTIPLIER)
      );
      this._clock = typeof options.clock === 'function' ? options.clock : defaultClock;
      this._onChange = typeof options.onChange === 'function' ? options.onChange : null;
      this._root = null;
      this._countEl = null;
      this._multiplierEl = null;
      this._messageEl = null;
      this._liveEl = null;
      this._animationTimer = 0;
      this._pausedAt = null;
      this._activeWindowMs = this.windowMs;

      this.reset(this._clock(), false);

      if (options.host) {
        this.mount(options.host);
      }
    }

    get currentCombo() {
      return this._currentCombo;
    }

    get current() {
      return this._currentCombo;
    }

    get maxCombo() {
      return this._maxCombo;
    }

    get multiplier() {
      return this._multiplierFor(this._currentCombo);
    }

    get highestMultiplier() {
      return this._highestMultiplier;
    }

    get remainingMs() {
      if (!this._currentCombo || !this._expiresAt) return 0;
      const now = this._pausedAt === null ? this._clock() : this._pausedAt;
      return Math.max(0, this._expiresAt - now);
    }

    get bonusPoints() {
      return this._bonusPoints;
    }

    get lastBonusPoints() {
      return this._lastBonusPoints;
    }

    mount(host) {
      if (!global.document) return null;

      const target = typeof host === 'string'
        ? global.document.querySelector(host)
        : host;
      if (!target || typeof target.appendChild !== 'function') return null;

      this.destroy();

      const root = global.document.createElement('section');
      root.className = 'combo-hud';
      root.dataset.active = 'false';
      root.dataset.tier = '1';
      root.setAttribute('aria-label', 'Combo meter');
      root.innerHTML = [
        '<div class="combo-hud__top">',
        '  <span class="combo-hud__label">COMBO</span>',
        '  <strong class="combo-hud__multiplier" aria-hidden="true">×1</strong>',
        '</div>',
        '<div class="combo-hud__readout">',
        '  <span class="combo-hud__count">READY</span>',
        '  <span class="combo-hud__message">Chain food quickly</span>',
        '</div>',
        '<div class="combo-hud__track" aria-hidden="true">',
        '  <span class="combo-hud__fill"></span>',
        '</div>',
        '<span class="combo-hud__live" aria-live="polite"></span>',
      ].join('');

      target.appendChild(root);
      this._root = root;
      this._countEl = root.querySelector('.combo-hud__count');
      this._multiplierEl = root.querySelector('.combo-hud__multiplier');
      this._messageEl = root.querySelector('.combo-hud__message');
      this._liveEl = root.querySelector('.combo-hud__live');
      this._render(this._clock(), false);
      return root;
    }

    reset(now = this._clock(), notify = true) {
      const timestamp = normalizeTime(now, this._clock);
      this._currentCombo = 0;
      this._maxCombo = 0;
      this._highestMultiplier = 1;
      this._expiresAt = 0;
      this._activeWindowMs = this.windowMs;
      this._pausedAt = null;
      this._foodsCollected = 0;
      this._basePoints = 0;
      this._bonusPoints = 0;
      this._lastBonusPoints = 0;
      this._totalPoints = 0;
      this._expiredChains = 0;
      this._lastFoodType = null;
      this._lastAward = null;
      this._render(timestamp, false);
      if (notify) this._emit('reset', timestamp);
      return this.getState(timestamp);
    }

    /**
     * Registers food and returns the score to add.
     *
     * Purple food advances the chain by two steps and adds 0.6 seconds.
     * Rare green/bonus food advances one step and adds 1.2 seconds.
     */
    registerFood(type = 'yellow', basePoints, now = this._clock()) {
      const timestamp = normalizeTime(now, this._clock);
      const foodType = normalizeFoodType(type);
      const rule = FOOD_RULES[foodType];
      const points = Number.isFinite(basePoints) && basePoints >= 0
        ? basePoints
        : rule.basePoints;

      if (this._pausedAt !== null) this.resume(timestamp);
      this.tick(timestamp);

      this._currentCombo += rule.comboSteps;
      this._maxCombo = Math.max(this._maxCombo, this._currentCombo);

      const multiplier = this._multiplierFor(this._currentCombo);
      this._highestMultiplier = Math.max(this._highestMultiplier, multiplier);
      this._activeWindowMs = this.windowMs + rule.windowBonusMs;
      this._expiresAt = timestamp + this._activeWindowMs;

      const totalPoints = Math.round(points * multiplier);
      const bonus = totalPoints - points;
      this._foodsCollected += 1;
      this._basePoints += points;
      this._bonusPoints += bonus;
      this._lastBonusPoints = bonus;
      this._totalPoints += totalPoints;
      this._lastFoodType = foodType;

      const award = Object.freeze({
        foodType,
        basePoints: points,
        comboSteps: rule.comboSteps,
        combo: this._currentCombo,
        multiplier,
        bonusPoints: bonus,
        totalPoints,
        remainingMs: this._activeWindowMs,
      });
      this._lastAward = award;

      this._render(timestamp, true, rule.label);
      this._emit('food', timestamp, award);
      return award;
    }

    /**
     * Advances the timer. Call once per animation frame while gameplay is active.
     */
    tick(now = this._clock()) {
      const timestamp = normalizeTime(now, this._clock);
      if (this._pausedAt !== null) return this.getState(this._pausedAt);

      if (this._currentCombo > 0 && timestamp >= this._expiresAt) {
        const expiredCombo = this._currentCombo;
        this._currentCombo = 0;
        this._expiresAt = 0;
        this._activeWindowMs = this.windowMs;
        this._lastBonusPoints = 0;
        this._expiredChains += 1;
        this._render(timestamp, false, expiredCombo > 1 ? 'Chain ended' : 'Chain food quickly');
        this._emit('expire', timestamp, { expiredCombo });
      } else {
        this._render(timestamp, false);
      }
      return this.getState(timestamp);
    }

    pause(now = this._clock()) {
      if (this._pausedAt !== null) return this.getState(this._pausedAt);
      this._pausedAt = normalizeTime(now, this._clock);
      return this.getState(this._pausedAt);
    }

    resume(now = this._clock()) {
      if (this._pausedAt === null) return this.getState(now);
      const timestamp = normalizeTime(now, this._clock);
      const pausedDuration = Math.max(0, timestamp - this._pausedAt);
      if (this._expiresAt) this._expiresAt += pausedDuration;
      this._pausedAt = null;
      this._render(timestamp, false);
      return this.getState(timestamp);
    }

    getState(now = this._clock()) {
      const timestamp = normalizeTime(now, this._clock);
      const effectiveNow = this._pausedAt === null ? timestamp : this._pausedAt;
      const remainingMs = this._currentCombo
        ? Math.max(0, this._expiresAt - effectiveNow)
        : 0;
      return Object.freeze({
        currentCombo: this._currentCombo,
        maxCombo: this._maxCombo,
        multiplier: this._multiplierFor(this._currentCombo),
        highestMultiplier: this._highestMultiplier,
        remainingMs,
        remainingRatio: this._currentCombo
          ? Math.max(0, Math.min(1, remainingMs / this._activeWindowMs))
          : 0,
        bonusPoints: this._bonusPoints,
        lastBonusPoints: this._lastBonusPoints,
        active: this._currentCombo > 0 && remainingMs > 0,
        paused: this._pausedAt !== null,
      });
    }

    getSummary() {
      return Object.freeze({
        foodsCollected: this._foodsCollected,
        maxCombo: this._maxCombo,
        highestMultiplier: this._highestMultiplier,
        basePoints: this._basePoints,
        bonusPoints: this._bonusPoints,
        totalPoints: this._totalPoints,
        expiredChains: this._expiredChains,
        lastFoodType: this._lastFoodType,
        lastAward: this._lastAward,
      });
    }

    destroy() {
      if (this._animationTimer) {
        global.clearTimeout(this._animationTimer);
        this._animationTimer = 0;
      }
      if (this._root && this._root.parentNode) {
        this._root.parentNode.removeChild(this._root);
      }
      this._root = null;
      this._countEl = null;
      this._multiplierEl = null;
      this._messageEl = null;
      this._liveEl = null;
    }

    _multiplierFor(combo) {
      if (combo < 2) return 1;
      if (combo < 4) return Math.min(2, this.maxMultiplier);
      if (combo < 6) return Math.min(3, this.maxMultiplier);
      if (combo < 9) return Math.min(4, this.maxMultiplier);
      return this.maxMultiplier;
    }

    _render(now, animate, message) {
      if (!this._root) return;
      const state = this.getState(now);
      const displayMultiplier = state.multiplier;
      this._root.dataset.active = String(state.active);
      this._root.dataset.tier = String(displayMultiplier);
      this._root.style.setProperty('--combo-progress', String(state.remainingRatio));
      this._root.setAttribute(
        'aria-label',
        state.active
          ? `Combo ${state.currentCombo}, score multiplier ${displayMultiplier}`
          : 'Combo meter ready'
      );
      this._countEl.textContent = state.active ? `${state.currentCombo} HIT` : 'READY';
      this._multiplierEl.textContent = `×${displayMultiplier}`;
      if (message) this._messageEl.textContent = message;
      if (!state.active && !message) this._messageEl.textContent = 'Chain food quickly';

      if (animate) {
        this._root.classList.remove('combo-hud--pop');
        // Reading layout restarts the short animation for consecutive pickups.
        void this._root.offsetWidth;
        this._root.classList.add('combo-hud--pop');
        if (this._animationTimer) global.clearTimeout(this._animationTimer);
        this._animationTimer = global.setTimeout(() => {
          if (this._root) this._root.classList.remove('combo-hud--pop');
        }, 320);
        this._liveEl.textContent =
          `${state.currentCombo} hit combo. ${displayMultiplier} times score.`;
      }
    }

    _emit(reason, now, detail = null) {
      if (!this._onChange) return;
      this._onChange(this.getState(now), reason, detail);
    }
  }

  ComboSystem.FOOD_RULES = FOOD_RULES;
  ComboSystem.DEFAULT_WINDOW_MS = DEFAULT_WINDOW_MS;
  global.ComboSystem = ComboSystem;
})(typeof window !== 'undefined' ? window : globalThis);
