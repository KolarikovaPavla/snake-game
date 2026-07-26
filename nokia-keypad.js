(function () {
  'use strict';

  const DIRECTIONS = {
    up: { key: 'ArrowUp', code: 'ArrowUp' },
    left: { key: 'ArrowLeft', code: 'ArrowLeft' },
    right: { key: 'ArrowRight', code: 'ArrowRight' },
    down: { key: 'ArrowDown', code: 'ArrowDown' }
  };

  const KEYBOARD_TO_BUTTON = {
    ArrowUp: 'up',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'down',
    Enter: 'primary',
    ' ': 'pause',
    Escape: 'back',
    '2': 'up',
    '4': 'left',
    '5': 'primary',
    '6': 'right',
    '8': 'down',
    '0': 'pause'
  };

  function escapeSelector(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function resolveHost(host) {
    if (typeof host === 'string') return document.querySelector(host);
    return host && host.nodeType === 1 ? host : null;
  }

  function createButton(config) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nk-key ${config.className || ''}`.trim();
    button.dataset.nkAction = config.action || '';
    button.setAttribute('aria-label', config.ariaLabel || config.label || 'Phone key');

    if (config.value) {
      button.dataset.nkValue = config.value;
    }

    const main = document.createElement('span');
    main.className = 'nk-key__main';
    main.setAttribute('aria-hidden', 'true');
    main.textContent = config.label || '';
    button.appendChild(main);

    if (config.secondary) {
      const secondary = document.createElement('span');
      secondary.className = 'nk-key__secondary';
      secondary.setAttribute('aria-hidden', 'true');
      secondary.textContent = config.secondary;
      button.appendChild(secondary);
    }

    if (config.hint) {
      const hint = document.createElement('span');
      hint.className = 'nk-key__hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = config.hint;
      button.appendChild(hint);
    }

    return button;
  }

  function dispatchKey(target, key, code) {
    const receiver = target || window;
    const eventOptions = {
      key,
      code: code || key,
      bubbles: true,
      cancelable: true
    };

    receiver.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    window.setTimeout(function () {
      receiver.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
    }, 70);
  }

  function mount(host, options) {
    const target = resolveHost(host);
    if (!target) {
      throw new Error('NokiaKeypad.mount requires a valid host element or selector.');
    }

    const settings = Object.assign({
      haptics: true,
      dispatchTarget: window,
      getState: null,
      onDirection: null,
      onStart: null,
      onPause: null,
      onMenu: null,
      onBack: null,
      onKey: null
    }, options || {});

    let localState = { running: false, paused: false, gameOver: false };
    let destroyed = false;
    const pressedTimers = new Map();

    const root = document.createElement('section');
    root.className = 'nk-keypad';
    root.setAttribute('aria-label', 'Nokia phone keypad');
    root.innerHTML = [
      '<div class="nk-keypad__speaker" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>',
      '<div class="nk-keypad__brand" aria-hidden="true">NOKIA</div>',
      '<div class="nk-keypad__actions" role="group" aria-label="Phone actions"></div>',
      '<div class="nk-keypad__dial" role="group" aria-label="Number and movement keys"></div>',
      '<p class="nk-keypad__help">Use <b>2 4 6 8</b> to steer · <b>5</b> start · <b>0</b> pause</p>'
    ].join('');

    const actions = root.querySelector('.nk-keypad__actions');
    const dial = root.querySelector('.nk-keypad__dial');

    [
      {
        action: 'menu',
        label: 'MENU',
        hint: 'start',
        className: 'nk-key--soft nk-key--menu',
        ariaLabel: 'Menu or start game'
      },
      {
        action: 'primary',
        label: 'NAVI',
        hint: 'select',
        className: 'nk-key--navi',
        ariaLabel: 'Navi: start or pause game'
      },
      {
        action: 'back',
        label: 'C',
        hint: 'back',
        className: 'nk-key--soft nk-key--back',
        ariaLabel: 'Back'
      },
      {
        action: 'start',
        label: '☎',
        hint: 'play',
        className: 'nk-key--call',
        ariaLabel: 'Start game'
      },
      {
        action: 'pause',
        label: '●',
        hint: 'pause',
        className: 'nk-key--end',
        ariaLabel: 'Pause or resume game'
      }
    ].forEach(function (config) {
      actions.appendChild(createButton(config));
    });

    [
      { value: '1', label: '1', secondary: '.,?!' },
      { value: '2', action: 'up', label: '2', secondary: 'ABC', hint: '▲', ariaLabel: '2, move up' },
      { value: '3', label: '3', secondary: 'DEF' },
      { value: '4', action: 'left', label: '4', secondary: 'GHI', hint: '◀', ariaLabel: '4, move left' },
      { value: '5', action: 'primary', label: '5', secondary: 'JKL', hint: 'OK', ariaLabel: '5, start or pause game' },
      { value: '6', action: 'right', label: '6', secondary: 'MNO', hint: '▶', ariaLabel: '6, move right' },
      { value: '7', label: '7', secondary: 'PQRS' },
      { value: '8', action: 'down', label: '8', secondary: 'TUV', hint: '▼', ariaLabel: '8, move down' },
      { value: '9', label: '9', secondary: 'WXYZ' },
      { value: '*', label: '*', secondary: '+' },
      { value: '0', action: 'pause', label: '0', secondary: 'space', hint: 'Ⅱ', ariaLabel: '0, pause or resume game' },
      { value: '#', label: '#', secondary: 'silent' }
    ].forEach(function (config) {
      config.className = 'nk-key--number';
      dial.appendChild(createButton(config));
    });

    target.replaceChildren(root);

    function readState() {
      if (typeof settings.getState === 'function') {
        const externalState = settings.getState();
        if (externalState && typeof externalState === 'object') {
          return Object.assign({}, localState, externalState);
        }
      }
      return Object.assign({}, localState);
    }

    function updatePrimaryLabel() {
      const state = readState();
      const primaryKeys = root.querySelectorAll('[data-nk-action="primary"]');
      const nextAction = state.running && !state.gameOver ? (state.paused ? 'resume' : 'pause') : 'start';

      primaryKeys.forEach(function (key) {
        key.dataset.nkMode = nextAction;
        key.setAttribute('aria-label', `${key.dataset.nkValue === '5' ? '5, ' : ''}${nextAction} game`);
        const hint = key.querySelector('.nk-key__hint');
        if (hint && key.classList.contains('nk-key--navi')) {
          hint.textContent = nextAction;
        }
      });

      root.dataset.nkState = state.paused ? 'paused' : (state.running ? 'running' : 'ready');
    }

    function provideFeedback(button) {
      if (!button) return;
      button.classList.remove('nk-key--pressed');
      void button.offsetWidth;
      button.classList.add('nk-key--pressed');

      const oldTimer = pressedTimers.get(button);
      if (oldTimer) window.clearTimeout(oldTimer);
      pressedTimers.set(button, window.setTimeout(function () {
        button.classList.remove('nk-key--pressed');
        pressedTimers.delete(button);
      }, 130));

      if (settings.haptics && navigator.vibrate) {
        navigator.vibrate(12);
      }
    }

    function useCallback(callback, fallback) {
      if (typeof callback === 'function') {
        callback();
      } else {
        fallback();
      }
    }

    function start() {
      localState.running = true;
      localState.paused = false;
      localState.gameOver = false;
      useCallback(settings.onStart, function () {
        dispatchKey(settings.dispatchTarget, 'Enter', 'Enter');
      });
    }

    function pause() {
      const state = readState();
      localState.running = state.running;
      localState.paused = !state.paused;
      useCallback(settings.onPause, function () {
        dispatchKey(settings.dispatchTarget, ' ', 'Space');
      });
    }

    function primary() {
      const state = readState();
      if (!state.running || state.gameOver) {
        start();
      } else {
        pause();
      }
    }

    function runAction(action, button, sourceEvent) {
      if (destroyed) return;
      provideFeedback(button);

      if (button && button.dataset.nkValue && typeof settings.onKey === 'function') {
        settings.onKey(button.dataset.nkValue, sourceEvent);
      }

      if (DIRECTIONS[action]) {
        if (typeof settings.onDirection === 'function') {
          settings.onDirection(action, sourceEvent);
        } else {
          dispatchKey(settings.dispatchTarget, DIRECTIONS[action].key, DIRECTIONS[action].code);
        }
      } else if (action === 'primary') {
        primary();
      } else if (action === 'start') {
        start();
      } else if (action === 'pause') {
        pause();
      } else if (action === 'menu') {
        useCallback(settings.onMenu, primary);
      } else if (action === 'back') {
        useCallback(settings.onBack, function () {
          dispatchKey(settings.dispatchTarget, 'Escape', 'Escape');
        });
      }

      updatePrimaryLabel();
    }

    function onClick(event) {
      const button = event.target.closest('.nk-key');
      if (!button || !root.contains(button)) return;
      runAction(button.dataset.nkAction, button, event);
    }

    function onPhysicalKeyDown(event) {
      if (event.repeat) return;
      const action = KEYBOARD_TO_BUTTON[event.key];
      if (!action) return;
      const button = root.querySelector(`[data-nk-action="${escapeSelector(action)}"]`);
      provideFeedback(button);
    }

    root.addEventListener('click', onClick);
    window.addEventListener('keydown', onPhysicalKeyDown);
    updatePrimaryLabel();

    return {
      element: root,
      setState: function (nextState) {
        if (nextState && typeof nextState === 'object') {
          localState = Object.assign({}, localState, nextState);
          updatePrimaryLabel();
        }
      },
      focus: function () {
        const primaryButton = root.querySelector('[data-nk-action="primary"]');
        if (primaryButton) primaryButton.focus();
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        root.removeEventListener('click', onClick);
        window.removeEventListener('keydown', onPhysicalKeyDown);
        pressedTimers.forEach(function (timer) {
          window.clearTimeout(timer);
        });
        pressedTimers.clear();
        root.remove();
      }
    };
  }

  window.NokiaKeypad = Object.freeze({ mount });
})();
