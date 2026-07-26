(function gameOverScreenModule(global) {
  'use strict';

  const DEFAULTS = {
    score: 0,
    bestScore: 0,
    maxCombo: 1,
    foodEaten: 0,
    durationMs: 0,
    leaderboardStatus: '',
    rank: null,
  };

  function toNonNegativeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function formatNumber(value) {
    return Math.round(toNonNegativeNumber(value, 0)).toLocaleString();
  }

  function formatDuration(stats) {
    let totalSeconds;

    if (stats.durationMs != null) {
      totalSeconds = Math.round(toNonNegativeNumber(stats.durationMs, 0) / 1000);
    } else if (stats.durationSeconds != null) {
      totalSeconds = Math.round(toNonNegativeNumber(stats.durationSeconds, 0));
    } else if (stats.runDuration != null) {
      totalSeconds = Math.round(toNonNegativeNumber(stats.runDuration, 0));
    } else {
      totalSeconds = 0;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function normalizeOptions(hostOrOptions, maybeOptions) {
    if (hostOrOptions && hostOrOptions.nodeType === 1) {
      return Object.assign({}, maybeOptions, { host: hostOrOptions });
    }

    return Object.assign({}, hostOrOptions);
  }

  class GameOverScreen {
    constructor(hostOrOptions, maybeOptions) {
      const options = normalizeOptions(hostOrOptions, maybeOptions);

      this.host = options.host || document.body;
      if (!this.host || typeof this.host.appendChild !== 'function') {
        throw new TypeError('GameOverScreen requires a valid host element.');
      }

      this.onRestart = typeof options.onRestart === 'function' ? options.onRestart : null;
      this.onClose = typeof options.onClose === 'function' ? options.onClose : null;
      this.onShare = typeof options.onShare === 'function' ? options.onShare : null;
      this.shareTitle = options.shareTitle || 'Nokia Snake';
      this.stats = Object.assign({}, DEFAULTS);
      this.previouslyFocused = null;
      this.shareResetTimer = null;

      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleBackdropClick = this.handleBackdropClick.bind(this);
      this.handleRestart = this.handleRestart.bind(this);
      this.handleClose = this.handleClose.bind(this);
      this.handleShare = this.handleShare.bind(this);

      this.mount();
    }

    mount() {
      this.root = document.createElement('div');
      this.root.className = 'gos-backdrop';
      this.root.hidden = true;
      this.root.setAttribute('aria-hidden', 'true');

      this.root.innerHTML = `
        <section
          class="gos-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gos-title"
          aria-describedby="gos-summary"
          tabindex="-1"
        >
          <div class="gos-scanlines" aria-hidden="true"></div>
          <button class="gos-close" type="button" aria-label="Close game over screen">
            <span aria-hidden="true">×</span>
          </button>

          <div class="gos-eyebrow" aria-hidden="true">
            <span class="gos-signal">▮▮▮▯</span>
            <span>RUN COMPLETE</span>
            <span>●</span>
          </div>

          <header class="gos-header">
            <span class="gos-snake-mark" aria-hidden="true">●■▪</span>
            <h2 class="gos-title" id="gos-title">GAME OVER</h2>
            <p class="gos-summary" id="gos-summary">Nice run. The grid is ready for another.</p>
          </header>

          <div class="gos-score-card">
            <span class="gos-score-label">FINAL SCORE</span>
            <strong class="gos-score" data-gos-value="score">0</strong>
            <span class="gos-best" data-gos-value="best">BEST 0</span>
          </div>

          <dl class="gos-stats" aria-label="Run statistics">
            <div class="gos-stat">
              <dt>MAX COMBO</dt>
              <dd data-gos-value="combo">×1</dd>
            </div>
            <div class="gos-stat">
              <dt>FOOD EATEN</dt>
              <dd data-gos-value="food">0</dd>
            </div>
            <div class="gos-stat">
              <dt>RUN TIME</dt>
              <dd data-gos-value="duration">0:00</dd>
            </div>
          </dl>

          <div class="gos-leaderboard" data-gos-section="leaderboard" hidden>
            <span class="gos-trophy" aria-hidden="true">◆</span>
            <span data-gos-value="leaderboard"></span>
          </div>

          <div class="gos-actions">
            <button class="gos-button gos-button-primary" type="button" data-gos-action="restart">
              <span aria-hidden="true">▶</span>
              Play again
            </button>
            <button class="gos-button gos-button-secondary" type="button" data-gos-action="share">
              <span aria-hidden="true">↗</span>
              <span data-gos-value="share-label">Share result</span>
            </button>
          </div>

          <p class="gos-hint">
            <kbd>Enter</kbd> restart
            <span aria-hidden="true">·</span>
            <kbd>Esc</kbd> close
          </p>
          <div class="gos-announcer" role="status" aria-live="polite" aria-atomic="true"></div>
        </section>
      `;

      this.panel = this.root.querySelector('.gos-panel');
      this.closeButton = this.root.querySelector('.gos-close');
      this.restartButton = this.root.querySelector('[data-gos-action="restart"]');
      this.shareButton = this.root.querySelector('[data-gos-action="share"]');
      this.shareLabel = this.root.querySelector('[data-gos-value="share-label"]');
      this.announcer = this.root.querySelector('.gos-announcer');

      this.closeButton.addEventListener('click', this.handleClose);
      this.restartButton.addEventListener('click', this.handleRestart);
      this.shareButton.addEventListener('click', this.handleShare);
      this.root.addEventListener('click', this.handleBackdropClick);
      document.addEventListener('keydown', this.handleKeydown, true);
      this.host.appendChild(this.root);
    }

    show(stats) {
      this.stats = Object.assign({}, DEFAULTS, stats);
      this.previouslyFocused = document.activeElement;
      this.updateContent();
      this.resetShareButton();

      this.root.hidden = false;
      this.root.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('gos-is-open');

      requestAnimationFrame(() => {
        if (!this.isOpen()) return;
        this.root.classList.add('gos-visible');
        const nameModal = document.getElementById('name-modal');
        if (!nameModal || !nameModal.classList.contains('show')) {
          this.restartButton.focus({ preventScroll: true });
        }
      });

      return this;
    }

    hide(options) {
      if (!this.isOpen()) return this;

      const settings = Object.assign({ restoreFocus: true }, options);
      this.root.classList.remove('gos-visible');
      this.root.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('gos-is-open');

      const finishHiding = () => {
        if (!this.root.classList.contains('gos-visible')) {
          this.root.hidden = true;
        }
      };

      if (
        typeof global.matchMedia !== 'function' ||
        global.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        finishHiding();
      } else {
        global.setTimeout(finishHiding, 220);
      }

      if (
        settings.restoreFocus &&
        this.previouslyFocused &&
        typeof this.previouslyFocused.focus === 'function' &&
        document.contains(this.previouslyFocused)
      ) {
        this.previouslyFocused.focus({ preventScroll: true });
      }

      return this;
    }

    isOpen() {
      return Boolean(this.root && !this.root.hidden && this.root.getAttribute('aria-hidden') === 'false');
    }

    updateContent() {
      const score = toNonNegativeNumber(this.stats.score, 0);
      const previousBest = toNonNegativeNumber(this.stats.bestScore, 0);
      const bestScore = Math.max(score, previousBest);
      const maxCombo = Math.max(1, Math.round(toNonNegativeNumber(this.stats.maxCombo, 1)));
      const foodEaten = Math.round(toNonNegativeNumber(this.stats.foodEaten, 0));

      this.setText('score', formatNumber(score));
      this.setText('best', `BEST ${formatNumber(bestScore)}`);
      this.setText('combo', `×${formatNumber(maxCombo)}`);
      this.setText('food', formatNumber(foodEaten));
      this.setText('duration', formatDuration(this.stats));

      const leaderboard = this.root.querySelector('[data-gos-section="leaderboard"]');
      const leaderboardMessage = this.getLeaderboardMessage();
      leaderboard.hidden = !leaderboardMessage;
      this.setText('leaderboard', leaderboardMessage);

      const title = this.root.querySelector('.gos-title');
      const summary = this.root.querySelector('.gos-summary');
      const isNewBest = Boolean(this.stats.isNewBest) || (score > 0 && score > previousBest);
      title.textContent = isNewBest ? 'NEW BEST!' : 'GAME OVER';
      summary.textContent = isNewBest
        ? 'A new personal record. That one deserves another run.'
        : (this.stats.message || 'Nice run. The grid is ready for another.');
    }

    getLeaderboardMessage() {
      const rank = Number(this.stats.rank);
      if (Number.isInteger(rank) && rank > 0) {
        return `Leaderboard rank #${rank}`;
      }

      if (this.stats.leaderboardStatus) {
        return String(this.stats.leaderboardStatus);
      }

      return '';
    }

    setText(name, value) {
      const element = this.root.querySelector(`[data-gos-value="${name}"]`);
      if (element) element.textContent = value;
    }

    handleRestart() {
      const callback = this.onRestart;
      const stats = Object.assign({}, this.stats);
      this.hide({ restoreFocus: false });
      if (callback) callback(stats);
    }

    handleClose() {
      const callback = this.onClose;
      const stats = Object.assign({}, this.stats);
      this.hide();
      if (callback) callback(stats);
    }

    handleBackdropClick(event) {
      if (event.target === this.root) {
        this.handleClose();
      }
    }

    handleKeydown(event) {
      if (!this.isOpen()) return;

      const nameModal = document.getElementById('name-modal');
      if (nameModal && nameModal.classList.contains('show')) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.handleClose();
        return;
      }

      if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.handleRestart();
        return;
      }

      if (event.key === 'Tab') {
        this.trapFocus(event);
      }
    }

    trapFocus(event) {
      const focusable = Array.from(
        this.panel.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      ).filter((element) => !element.hidden);

      if (!focusable.length) {
        event.preventDefault();
        this.panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    async handleShare() {
      const text = this.buildShareText();
      const shareData = {
        title: this.shareTitle,
        text,
        url: this.stats.shareUrl || global.location.href,
      };

      let method = 'copy';
      let success = false;
      let error = null;

      try {
        if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
          method = 'share';
          await navigator.share(shareData);
          success = true;
          this.showShareFeedback('Result shared!');
        } else {
          await this.copyText(`${text}\n${shareData.url}`);
          success = true;
          this.showShareFeedback('Result copied!');
        }
      } catch (shareError) {
        error = shareError;
        if (shareError && shareError.name === 'AbortError') return;

        try {
          method = 'copy';
          await this.copyText(`${text}\n${shareData.url}`);
          success = true;
          error = null;
          this.showShareFeedback('Result copied!');
        } catch (copyError) {
          error = copyError;
          this.showShareFeedback('Could not copy', true);
        }
      } finally {
        if (this.onShare && !(error && error.name === 'AbortError')) {
          this.onShare({
            success,
            method,
            error,
            text,
            stats: Object.assign({}, this.stats),
          });
        }
      }
    }

    buildShareText() {
      const score = formatNumber(this.stats.score);
      const combo = Math.max(1, Math.round(toNonNegativeNumber(this.stats.maxCombo, 1)));
      return `I scored ${score} in Nokia Snake with a ×${combo} max combo. Can you beat it?`;
    }

    async copyText(text) {
      if (navigator.clipboard && global.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      this.root.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();

      if (!copied) throw new Error('Copy command was not available.');
    }

    showShareFeedback(message, isError) {
      global.clearTimeout(this.shareResetTimer);
      this.shareLabel.textContent = message;
      this.shareButton.classList.toggle('gos-button-error', Boolean(isError));
      this.announcer.textContent = message;
      this.shareResetTimer = global.setTimeout(() => this.resetShareButton(), 2200);
    }

    resetShareButton() {
      global.clearTimeout(this.shareResetTimer);
      if (!this.shareLabel) return;
      const canShare = typeof navigator.share === 'function';
      this.shareLabel.textContent = canShare ? 'Share result' : 'Copy result';
      this.shareButton.classList.remove('gos-button-error');
      this.announcer.textContent = '';
    }

    destroy() {
      global.clearTimeout(this.shareResetTimer);
      document.removeEventListener('keydown', this.handleKeydown, true);
      document.documentElement.classList.remove('gos-is-open');
      if (this.root) this.root.remove();
    }
  }

  global.GameOverScreen = GameOverScreen;
})(window);
