(() => {
  'use strict';

  const STORAGE_KEY = 'snake_sound_muted';
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const controls = new Set();

  let context = null;
  let masterGain = null;
  let muted = readMutedPreference();
  let unlockInstalled = false;
  let audioAvailable = Boolean(AudioContextClass);

  function readMutedPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (_) {
      return false;
    }
  }

  function saveMutedPreference() {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(muted));
    } catch (_) {
      // Sound still works when storage is unavailable (for example, private mode).
    }
  }

  function ensureContext() {
    if (!audioAvailable || !AudioContextClass) return null;
    if (!context) {
      try {
        context = new AudioContextClass();
        masterGain = context.createGain();
        masterGain.gain.value = muted ? 0 : 0.24;
        masterGain.connect(context.destination);
      } catch (_) {
        context = null;
        masterGain = null;
        audioAvailable = false;
        updateControls();
        return null;
      }
    }
    return context;
  }

  async function unlock() {
    const audioContext = ensureContext();
    if (!audioContext) {
      updateControls();
      return false;
    }

    try {
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      return audioContext.state === 'running';
    } catch (_) {
      return false;
    } finally {
      updateControls();
    }
  }

  function installUnlockListeners() {
    if (unlockInstalled || !AudioContextClass) return;
    unlockInstalled = true;

    const attemptUnlock = async () => {
      const unlocked = await unlock();
      if (unlocked) {
        document.removeEventListener('pointerdown', attemptUnlock, true);
        document.removeEventListener('keydown', attemptUnlock, true);
        document.removeEventListener('touchstart', attemptUnlock, true);
      }
    };

    document.addEventListener('pointerdown', attemptUnlock, true);
    document.addEventListener('keydown', attemptUnlock, true);
    document.addEventListener('touchstart', attemptUnlock, true);
  }

  function setMasterLevel(value, when) {
    if (!masterGain || !context) return;
    const now = typeof when === 'number' ? when : context.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(value, now, 0.015);
  }

  function setMuted(nextMuted) {
    muted = Boolean(nextMuted);
    saveMutedPreference();
    if (context) {
      setMasterLevel(muted ? 0 : 0.24);
    }
    updateControls();
    return muted;
  }

  function toggleMuted() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (!nextMuted) {
      unlock().then((unlocked) => {
        if (unlocked) play('unmute');
      });
    }
    return nextMuted;
  }

  function createControl(host) {
    const target = typeof host === 'string' ? document.querySelector(host) : host;
    if (!target || typeof target.appendChild !== 'function') return null;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sound-toggle';
    button.innerHTML =
      '<span class="sound-toggle__icon" aria-hidden="true"></span>' +
      '<span class="sound-toggle__label"></span>';
    button.addEventListener('click', toggleMuted);
    target.appendChild(button);
    controls.add(button);
    updateControl(button);
    installUnlockListeners();
    return button;
  }

  function updateControls() {
    controls.forEach(updateControl);
  }

  function updateControl(button) {
    if (!button.isConnected) {
      controls.delete(button);
      return;
    }

    const available = audioAvailable;
    const icon = button.querySelector('.sound-toggle__icon');
    const label = button.querySelector('.sound-toggle__label');
    const isOff = muted || !available;
    button.classList.toggle('is-muted', isOff);
    button.disabled = !available;
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute(
      'aria-label',
      available ? (muted ? 'Turn sound on' : 'Mute sound') : 'Sound unavailable'
    );
    button.title = button.getAttribute('aria-label');
    if (icon) icon.textContent = isOff ? '♪̸' : '♪';
    if (label) label.textContent = available ? (muted ? 'SOUND OFF' : 'SOUND ON') : 'NO AUDIO';
  }

  function note(frequency, start, duration, options = {}) {
    if (!context || !masterGain || muted || context.state !== 'running') return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const end = start + duration;
    const peak = Math.max(0.001, options.volume || 0.24);

    oscillator.type = options.type || 'square';
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (options.slideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.slideTo),
        end
      );
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.012, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(end + 0.015);
  }

  function noise(start, duration, volume = 0.12) {
    if (!context || !masterGain || muted || context.state !== 'running') return;

    const frameCount = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount);
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1150, start);
    filter.frequency.exponentialRampToValueAtTime(180, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(start);
  }

  function sequence(notes, options = {}) {
    if (!context) return;
    const start = context.currentTime + (options.delay || 0.01);
    notes.forEach((item) => {
      const [offset, frequency, duration, volume, type, slideTo] = item;
      note(frequency, start + offset, duration, { volume, type, slideTo });
    });
  }

  function play(effect, options = {}) {
    if (muted || !audioAvailable) return false;
    const audioContext = ensureContext();
    if (!audioContext) return false;

    if (audioContext.state !== 'running') {
      unlock().then((unlocked) => {
        if (unlocked) play(effect, options);
      });
      return false;
    }

    const now = audioContext.currentTime + 0.01;
    switch (effect) {
      case 'start':
        sequence([
          [0, 262, 0.07, 0.18, 'square'],
          [0.08, 392, 0.07, 0.2, 'square'],
          [0.16, 523, 0.11, 0.22, 'square'],
        ]);
        break;
      case 'food':
      case 'yellow':
        sequence([
          [0, 660, 0.045, 0.17, 'square'],
          [0.045, 880, 0.065, 0.16, 'square'],
        ]);
        break;
      case 'purple':
        sequence([
          [0, 523, 0.055, 0.17, 'square'],
          [0.055, 784, 0.055, 0.18, 'square'],
          [0.11, 1047, 0.08, 0.16, 'triangle'],
        ]);
        break;
      case 'green':
      case 'bonus':
        sequence([
          [0, 659, 0.05, 0.15, 'square'],
          [0.052, 784, 0.05, 0.16, 'square'],
          [0.104, 988, 0.05, 0.17, 'square'],
          [0.156, 1319, 0.1, 0.18, 'triangle'],
        ]);
        break;
      case 'combo': {
        const tier = Math.max(2, Math.min(8, Number(options.tier) || 2));
        const base = 440 + (tier - 2) * 55;
        const count = Math.min(4, tier - 1);
        const notes = [];
        for (let i = 0; i < count; i += 1) {
          notes.push([i * 0.042, base * (1 + i * 0.25), 0.07, 0.13, 'square']);
        }
        notes.push([count * 0.042, base * 2, 0.11, 0.16, 'triangle']);
        sequence(notes);
        break;
      }
      case 'pause':
        note(440, now, 0.13, { volume: 0.15, type: 'square', slideTo: 220 });
        break;
      case 'resume':
        note(330, now, 0.13, { volume: 0.15, type: 'square', slideTo: 660 });
        break;
      case 'crash':
        note(180, now, 0.26, { volume: 0.2, type: 'sawtooth', slideTo: 45 });
        noise(now, 0.24, 0.1);
        break;
      case 'gameOver':
      case 'game-over':
        sequence([
          [0, 392, 0.12, 0.16, 'square'],
          [0.13, 294, 0.13, 0.16, 'square'],
          [0.27, 196, 0.24, 0.18, 'triangle', 98],
        ]);
        break;
      case 'highScore':
      case 'high-score':
        sequence([
          [0, 523, 0.07, 0.15, 'square'],
          [0.075, 659, 0.07, 0.16, 'square'],
          [0.15, 784, 0.07, 0.17, 'square'],
          [0.225, 1047, 0.16, 0.18, 'triangle'],
          [0.305, 1319, 0.13, 0.12, 'square'],
        ]);
        break;
      case 'unmute':
        sequence([
          [0, 440, 0.055, 0.12, 'square'],
          [0.06, 660, 0.075, 0.13, 'square'],
        ]);
        break;
      default:
        return false;
    }
    return true;
  }

  function food(type = 'yellow') {
    return play(type === 'green' ? 'bonus' : type);
  }

  installUnlockListeners();

  window.SnakeSound = Object.freeze({
    get available() {
      return audioAvailable;
    },
    createControl,
    unlock,
    play,
    food,
    start: () => play('start'),
    combo: (tier) => play('combo', { tier }),
    pause: () => play('pause'),
    resume: () => play('resume'),
    crash: () => play('crash'),
    gameOver: () => play('gameOver'),
    highScore: () => play('highScore'),
    isMuted: () => muted,
    setMuted,
    toggleMuted,
  });
})();
