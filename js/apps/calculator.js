import { icon } from '../icons.js';

const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };

function fmt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Error';
  const abs = Math.abs(number);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) {
    return number.toExponential(6).replace(/\.?0+e/, 'e');
  }
  return number.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

function compute(a, b, operator) {
  if (operator === '+') return a + b;
  if (operator === '-') return a - b;
  if (operator === '*') return a * b;
  if (operator === '/') return b === 0 ? NaN : a / b;
  return b;
}

export function mount(body, ctx) {
  const state = {
    current: '0',
    accumulator: null,
    operator: null,
    waiting: false,
    expression: '',
    history: [],
    error: false,
  };

  body.innerHTML = `
    <div class="calculator-app">
      <div class="calc-display">
        <div class="calc-expression" id="calc-expression">&nbsp;</div>
        <div class="calc-value" id="calc-value">0</div>
      </div>
      <div class="calc-history" id="calc-history"></div>
      <div class="calc-pad">
        <button class="calc-key fn" data-key="clear">AC</button>
        <button class="calc-key fn" data-key="sign">±</button>
        <button class="calc-key fn" data-key="percent">%</button>
        <button class="calc-key op" data-key="/">${SYMBOL['/']}</button>
        <button class="calc-key" data-key="7">7</button>
        <button class="calc-key" data-key="8">8</button>
        <button class="calc-key" data-key="9">9</button>
        <button class="calc-key op" data-key="*">${SYMBOL['*']}</button>
        <button class="calc-key" data-key="4">4</button>
        <button class="calc-key" data-key="5">5</button>
        <button class="calc-key" data-key="6">6</button>
        <button class="calc-key op" data-key="-">${SYMBOL['-']}</button>
        <button class="calc-key" data-key="1">1</button>
        <button class="calc-key" data-key="2">2</button>
        <button class="calc-key" data-key="3">3</button>
        <button class="calc-key op" data-key="+">${SYMBOL['+']}</button>
        <button class="calc-key zero" data-key="0">0</button>
        <button class="calc-key" data-key=".">.</button>
        <button class="calc-key equals" data-key="equals">=</button>
      </div>
      <div class="calc-foot">${icon('calculator', 12)} CloudBook Calculator · keyboard ready</div>
    </div>`;

  const valueEl = body.querySelector('#calc-value');
  const expressionEl = body.querySelector('#calc-expression');
  const historyEl = body.querySelector('#calc-history');

  function render() {
    valueEl.textContent = state.error ? 'Error' : fmt(state.current);
    valueEl.classList.toggle('is-error', state.error);
    expressionEl.textContent = state.expression || '\u00a0';
    historyEl.innerHTML = state.history.slice(0, 3).map((item) => `<button class="calc-history-item">${item}</button>`).join('');
    historyEl.querySelectorAll('.calc-history-item').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        state.current = state.history[i].split('=').pop().trim().replaceAll(',', '');
        state.error = false;
        state.expression = '';
        state.waiting = true;
        render();
      });
    });
  }

  function inputDigit(digit) {
    if (state.error) reset();
    if (state.waiting) {
      state.current = digit;
      state.waiting = false;
    } else {
      state.current = state.current === '0' ? digit : state.current + digit;
      if (state.current.replace('-', '').replace('.', '').length > 14) {
        state.current = state.current.slice(0, 15);
      }
    }
    render();
  }

  function inputDot() {
    if (state.error) reset();
    if (state.waiting) {
      state.current = '0.';
      state.waiting = false;
    } else if (!state.current.includes('.')) {
      state.current += '.';
    }
    render();
  }

  function reset() {
    state.current = '0';
    state.accumulator = null;
    state.operator = null;
    state.waiting = false;
    state.expression = '';
    state.error = false;
    render();
  }

  function setOperator(operator) {
    if (state.error) return;
    const value = Number(state.current);
    if (state.operator && !state.waiting) {
      const result = compute(state.accumulator, value, state.operator);
      if (!Number.isFinite(result)) { fail(); return; }
      state.accumulator = result;
      state.current = String(result);
    } else {
      state.accumulator = value;
    }
    state.operator = operator;
    state.waiting = true;
    state.expression = `${fmt(state.accumulator)} ${SYMBOL[operator]}`;
    render();
  }

  function fail() {
    state.error = true;
    state.current = '0';
    state.accumulator = null;
    state.operator = null;
    state.expression = '';
    state.waiting = true;
    render();
  }

  function equals() {
    if (state.error) return;
    if (state.operator === null) {
      state.expression = `${fmt(state.current)} =`;
      state.waiting = true;
      render();
      return;
    }
    const left = state.accumulator;
    const right = Number(state.current);
    const result = compute(left, right, state.operator);
    if (!Number.isFinite(result)) { fail(); return; }
    const line = `${fmt(left)} ${SYMBOL[state.operator]} ${fmt(right)} = ${fmt(result)}`;
    state.history.unshift(line);
    state.history = state.history.slice(0, 8);
    state.current = String(result);
    state.expression = line;
    state.accumulator = null;
    state.operator = null;
    state.waiting = true;
    render();
  }

  function backspace() {
    if (state.error) { reset(); return; }
    if (state.waiting) return;
    state.current = state.current.length > 1 ? state.current.slice(0, -1) : '0';
    if (state.current === '-') state.current = '0';
    render();
  }

  function handleKey(key) {
    if (/^\d$/.test(key)) inputDigit(key);
    else if (key === '.') inputDot();
    else if (key === '+' || key === '-' || key === '*' || key === '/') setOperator(key);
    else if (key === '=' || key === 'Enter') equals();
    else if (key === 'clear' || key === 'Escape') reset();
    else if (key === 'sign') {
      if (state.error) return;
      state.current = state.current.startsWith('-') ? state.current.slice(1) : `-${state.current}`;
      render();
    } else if (key === 'percent') {
      if (state.error) return;
      state.current = String(Number(state.current) / 100);
      render();
    } else if (key === 'Backspace') backspace();
  }

  body.querySelectorAll('[data-key]').forEach((btn) => {
    btn.addEventListener('click', () => handleKey(btn.dataset.key));
  });

  const onKey = (e) => {
    if (!ctx.win.el.classList.contains('active')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map = { Enter: 'Enter', Escape: 'Escape', Backspace: 'Backspace', Delete: 'clear' };
    const key = map[e.key] || e.key;
    const valid = /^[\d.+\-*/=]$/.test(key) || ['Enter', 'Escape', 'Backspace', 'clear'].includes(key);
    if (!valid) return;
    e.preventDefault();
    handleKey(key);
  };
  document.addEventListener('keydown', onKey);

  render();

  return () => document.removeEventListener('keydown', onKey);
}
