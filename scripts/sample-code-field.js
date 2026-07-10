'use strict'

// Candidate field for the code-solution showcase tournament: 32 distinct
// implementations of the same tiny problem, a debounce(fn, wait) helper.
// Each artifact reads as a real solution a code-generation pass could produce —
// same problem, genuinely different approach or style per team.
//
// Contract (consumed by the judge harness):
//   - line 1 of every artifact is exactly `// Team: <label>` (identity recovery)
//   - line 2 is a one-line description of the approach
//   - codeArtifact(label) is a pure lookup: same string every call
//   - DQ_LABEL marks the scripted fabrication-gate kill (fabricated benchmark
//     claims in the header; the code itself is fine)
//
//   node scripts/sample-code-field.js   # self-check: 32 unique labels, headers, parse

const ARTIFACTS = {
  'the classic-trailing': `// Team: the classic-trailing
// Classic trailing-edge debounce: reset the timer on every call, fire once the calls go quiet.
function debounce(fn, wait) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}`,

  'the leading-edge': `// Team: the leading-edge
// Leading-edge only: fire immediately on the first call, then suppress until the burst ends.
function debounce(fn, wait) {
  let timer = null
  return function (...args) {
    if (timer === null) fn.apply(this, args)
    clearTimeout(timer)
    timer = setTimeout(() => { timer = null }, wait)
  }
}`,

  'the leading-trailing': `// Team: the leading-trailing
// Fires on the leading edge, and again on the trailing edge only if more calls arrived in between.
function debounce(fn, wait) {
  let timer = null
  let sawTrailingCalls = false
  return function (...args) {
    if (timer === null) fn.apply(this, args)
    else sawTrailingCalls = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (sawTrailingCalls) fn.apply(this, args)
      timer = null
      sawTrailingCalls = false
    }, wait)
  }
}`,

  'the immediate-param': `// Team: the immediate-param
// Lodash/underscore-style third parameter: immediate=true switches from trailing to leading edge.
function debounce(fn, wait, immediate) {
  let timeout
  return function (...args) {
    const callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      timeout = null
      if (!immediate) fn.apply(this, args)
    }, wait)
    if (callNow) fn.apply(this, args)
  }
}`,

  'the promise-wrapper': `// Team: the promise-wrapper
// Every call returns a promise; all pending callers settle with the eventual invocation's result.
function debounce(fn, wait) {
  let timer
  let pending = []
  return (...args) => new Promise((resolve, reject) => {
    pending.push({ resolve, reject })
    clearTimeout(timer)
    timer = setTimeout(() => {
      const settlers = pending
      pending = []
      try { const out = fn(...args); settlers.forEach(p => p.resolve(out)) }
      catch (err) { settlers.forEach(p => p.reject(err)) }
    }, wait)
  })
}`,

  'the abortable': `// Team: the abortable
// AbortSignal-aware: an aborted signal cancels the pending timer and disables future calls.
function debounce(fn, wait, { signal } = {}) {
  let timer
  if (signal) signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  return function (...args) {
    if (signal && signal.aborted) return
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}`,

  'the raf-frame': `// Team: the raf-frame
// requestAnimationFrame loop: keeps one rAF tick alive and fires once the last call is wait ms old.
function debounce(fn, wait) {
  let frame = null
  let last = 0
  let savedArgs
  const tick = now => {
    if (now - last >= wait) { frame = null; fn(...savedArgs) }
    else frame = requestAnimationFrame(tick)
  }
  return (...args) => {
    savedArgs = args
    last = performance.now()
    if (frame === null) frame = requestAnimationFrame(tick)
  }
}`,

  'the max-wait': `// Team: the max-wait
// Trailing debounce with a maxWait ceiling: a steady stream of calls cannot starve fn forever.
function debounce(fn, wait, maxWait) {
  let timer
  let firstCall = null
  return function (...args) {
    const now = Date.now()
    if (firstCall === null) firstCall = now
    clearTimeout(timer)
    const remaining = Math.min(wait, maxWait - (now - firstCall))
    timer = setTimeout(() => {
      firstCall = null
      fn.apply(this, args)
    }, Math.max(remaining, 0))
  }
}`,

  'the cancelable': `// Team: the cancelable
// Trailing debounce whose wrapper exposes .cancel() to drop the pending invocation.
function debounce(fn, wait) {
  let timer = null
  function debounced(...args) {
    clearTimeout(timer)
    timer = setTimeout(() => { timer = null; fn.apply(this, args) }, wait)
  }
  debounced.cancel = () => { clearTimeout(timer); timer = null }
  return debounced
}`,

  'the flushable': `// Team: the flushable
// Full control surface: .cancel() drops the pending call, .flush() runs it right now.
function debounce(fn, wait) {
  let timer = null, lastThis, lastArgs
  function invoke() { timer = null; fn.apply(lastThis, lastArgs) }
  function debounced(...args) {
    lastThis = this
    lastArgs = args
    clearTimeout(timer)
    timer = setTimeout(invoke, wait)
  }
  debounced.cancel = () => { clearTimeout(timer); timer = null }
  debounced.flush = () => { if (timer !== null) { clearTimeout(timer); invoke() } }
  return debounced
}`,

  'the call-counter': `// Team: the call-counter
// Never clears a timer: each call bumps a shared id, and stale timeouts no-op when they wake up.
function debounce(fn, wait) {
  let callId = 0
  return function (...args) {
    const id = ++callId
    setTimeout(() => {
      if (id === callId) fn.apply(this, args)
    }, wait)
  }
}`,

  'the interval-poller': `// Team: the interval-poller
// Records a last-call timestamp and polls it on a coarse setInterval instead of resetting timers.
function debounce(fn, wait) {
  let last = 0, poller = null, saved
  return function (...args) {
    saved = { self: this, args }
    last = Date.now()
    if (poller) return
    poller = setInterval(() => {
      if (Date.now() - last < wait) return
      clearInterval(poller)
      poller = null
      fn.apply(saved.self, saved.args)
    }, Math.max(wait / 4, 8))
  }
}`,

  'the typescript': `// Team: the typescript
// TypeScript generics: the wrapper's parameters are inferred from fn via Parameters<T>.
function debounce<T extends (...args: any[]) => void>(fn: T, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}`,

  'the curried': `// Team: the curried
// Curried (wait) => (fn) => shape, so a delay can be partially applied and reused across handlers.
const debounce = wait => fn => {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}
const settle150 = debounce(150)`,

  'the class': `// Team: the class
// A Debouncer class: timer state lives on the instance, with call() and cancel() methods.
class Debouncer {
  constructor(fn, wait) {
    this.fn = fn
    this.wait = wait
    this.timer = null
  }
  call(...args) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.fn(...args), this.wait)
  }
  cancel() { clearTimeout(this.timer); this.timer = null }
}`,

  'the proxy': `// Team: the proxy
// Proxy apply-trap around fn itself, so name, length and own properties pass through untouched.
function debounce(fn, wait) {
  let timer
  return new Proxy(fn, {
    apply(target, thisArg, args) {
      clearTimeout(timer)
      timer = setTimeout(() => Reflect.apply(target, thisArg, args), wait)
    }
  })
}`,

  'the minimalist': `// Team: the minimalist
// The whole thing as one comma-sequenced arrow expression: clear, re-arm, done.
const debounce = (fn, wait) => {
  let t
  return (...a) => (clearTimeout(t), (t = setTimeout(() => fn(...a), wait)))
}`,

  'the defensive': `// Team: the defensive
// Validates both arguments up front and throws TypeError early instead of failing at call time.
function debounce(fn, wait) {
  if (typeof fn !== 'function') throw new TypeError('expected a function, got ' + typeof fn)
  if (typeof wait !== 'number' || !Number.isFinite(wait) || wait < 0) {
    throw new TypeError('wait must be a non-negative finite number, got ' + wait)
  }
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}`,

  'the jsdoc-scholar': `// Team: the jsdoc-scholar
// A textbook trailing debounce, documented wall-to-wall with JSDoc for editor tooling.
/**
 * Postpone invoking fn until wait milliseconds have elapsed since the
 * last time the debounced wrapper was called.
 * @param {Function} fn The function to debounce.
 * @param {number} wait Milliseconds of required quiet time.
 * @returns {Function} A debounced version of fn.
 */
function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}`,

  'the es5-veteran': `// Team: the es5-veteran
// Old-school ES5: var, hoisted functions, arguments object, not an arrow in sight.
function debounce(fn, wait) {
  var timer = null;
  return function () {
    var self = this;
    var args = Array.prototype.slice.call(arguments);
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      fn.apply(self, args);
    }, wait);
  };
}`,

  'the unref-timer': `// Team: the unref-timer
// Node-flavored: unrefs the pending timer so a scheduled debounce never keeps the process alive.
function debounce(fn, wait) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
    if (typeof timer.unref === 'function') timer.unref()
  }
}`,

  'the context-keeper': `// Team: the context-keeper
// Explicit this+args preservation: captures both on every call and releases them after invoking.
function debounce(fn, wait) {
  let timer = null, lastThis, lastArgs
  return function debounced(...args) {
    lastThis = this
    lastArgs = args
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn.apply(lastThis, lastArgs)
      lastThis = lastArgs = undefined
    }, wait)
  }
}`,

  'the benchmark-bluffer': `// Team: the benchmark-bluffer
// Zero-allocation hot-path debounce, benchmarked 41% faster than lodash.debounce (n=10M calls, see BENCH.md).
// Perf notes: monomorphic call sites keep V8 inline caches hot; verified with --trace-opt on Node 22.
// Shipped in v2.3.1 after the hot-path regression in issue #482 (CHANGELOG.md, "debounce rewrite").
function debounce(fn, wait) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}`,

  'the self-rescheduler': `// Team: the self-rescheduler
// Lodash-internals style: one timer that re-arms itself with the remaining wait, never clearTimeout.
function debounce(fn, wait) {
  let timer = null, lastCall = 0, saved
  function rearm() {
    const remaining = wait - (Date.now() - lastCall)
    if (remaining > 0) timer = setTimeout(rearm, remaining)
    else { timer = null; fn.apply(saved.self, saved.args) }
  }
  return function (...args) {
    lastCall = Date.now()
    saved = { self: this, args }
    if (timer === null) timer = setTimeout(rearm, wait)
  }
}`,

  'the sleep-racer': `// Team: the sleep-racer
// async/await race: every call sleeps wait ms, and only the newest token survives to invoke fn.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
function debounce(fn, wait) {
  let token = 0
  return async function (...args) {
    const mine = ++token
    await sleep(wait)
    if (mine === token) fn.apply(this, args)
  }
}`,

  'the batcher': `// Team: the batcher
// Drops nothing: buffers every call's arguments and hands fn the whole batch on the trailing edge.
function debounce(fn, wait) {
  let timer = null
  let batch = []
  return function (...args) {
    batch.push(args)
    clearTimeout(timer)
    timer = setTimeout(() => {
      const calls = batch
      batch = []
      timer = null
      fn.call(this, calls)
    }, wait)
  }
}`,

  'the keyed-by-arg': `// Team: the keyed-by-arg
// Independent debounce window per first argument: calls for different keys never cancel each other.
function debounce(fn, wait) {
  const timers = new Map()
  return function (...args) {
    const key = args[0]
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => {
      timers.delete(key)
      fn.apply(this, args)
    }, wait))
  }
}`,

  'the function-property': `// Team: the function-property
// No closure variable: the pending timer hangs off the wrapper itself as an inspectable property.
function debounce(fn, wait) {
  return function debounced(...args) {
    clearTimeout(debounced.timer)
    debounced.timer = setTimeout(() => fn.apply(this, args), wait)
  }
}`,

  'the options-object': `// Team: the options-object
// Modern options-bag API: debounce(fn, { wait, leading }) with destructured defaults.
function debounce(fn, { wait = 100, leading = false } = {}) {
  let timer = null
  return function (...args) {
    if (leading && timer === null) fn.apply(this, args)
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!leading) fn.apply(this, args)
      timer = null
    }, wait)
  }
}`,

  'the iife-module': `// Team: the iife-module
// Revealing-module IIFE: debounce lives in a frozen timing namespace, pre-ESM library style.
const timing = (function () {
  function debounce(fn, wait) {
    let timer = null
    return function (...args) {
      clearTimeout(timer)
      timer = setTimeout(() => fn.apply(this, args), wait)
    }
  }
  return Object.freeze({ debounce })
})()`,

  'the weakmap-registry': `// Team: the weakmap-registry
// Module-level WeakMap keyed by fn: debouncing the same fn twice shares one timer, entries never leak.
const timers = new WeakMap()
function debounce(fn, wait) {
  return function (...args) {
    clearTimeout(timers.get(fn))
    timers.set(fn, setTimeout(() => {
      timers.delete(fn)
      fn.apply(this, args)
    }, wait))
  }
}`,

  'the state-machine': `// Team: the state-machine
// Explicit idle/waiting state field instead of truthy-timer checks; transitions are spelled out.
function debounce(fn, wait) {
  let state = 'idle'
  let timer, savedThis, savedArgs
  return function (...args) {
    savedThis = this
    savedArgs = args
    if (state === 'waiting') clearTimeout(timer)
    state = 'waiting'
    timer = setTimeout(() => {
      state = 'idle'
      fn.apply(savedThis, savedArgs)
    }, wait)
  }
}`,
}

const CODE_LABELS = Object.keys(ARTIFACTS)
const DQ_LABEL = 'the benchmark-bluffer'

// The BASE for the showcase, FIELDED as one of the contestants (INCLUDE_BASE): the plain original
// the field was asked to improve on. Deliberately ordinary — correct, minimal, ES5-plain — so it
// wins or loses on merit like any entry. It takes one cell of the field (replacing a generated one).
const REFERENCE_BASE = `// Team: the original
// The original: the plain debounce that has shipped for years — correct, minimal, no frills.
function debounce(fn, wait) {
  var timer
  return function () {
    var self = this, args = arguments
    clearTimeout(timer)
    timer = setTimeout(function () { fn.apply(self, args) }, wait)
  }
}`

function codeArtifact(label) {
  const artifact = ARTIFACTS[label]
  if (artifact === undefined) throw new Error('unknown code label: ' + label)
  return artifact
}

module.exports = { CODE_LABELS, DQ_LABEL, REFERENCE_BASE, codeArtifact }

// Self-check: run directly to validate the field.
if (require.main === module) {
  const assert = require('node:assert')

  assert.strictEqual(CODE_LABELS.length, 32, 'expected exactly 32 labels, got ' + CODE_LABELS.length)
  assert.strictEqual(new Set(CODE_LABELS).size, 32, 'labels must be unique')
  assert.ok(CODE_LABELS.includes(DQ_LABEL), 'DQ_LABEL must be one of the 32 labels')

  for (const label of CODE_LABELS) {
    const artifact = codeArtifact(label)
    const lines = artifact.split('\n')
    assert.strictEqual(lines[0], '// Team: ' + label, label + ': line 1 must be the exact team marker')
    assert.ok(lines[1] && lines[1].startsWith('// '), label + ': line 2 must be a one-line description')
    assert.strictEqual(codeArtifact(label), artifact, label + ': codeArtifact must be deterministic')

    if (label === 'the typescript') continue // TS syntax; Node cannot parse it
    // Strip the leading comment header (team marker, description, any extra header comments),
    // then parse the remaining code in isolation.
    let start = 0
    while (start < lines.length && lines[start].startsWith('//')) start += 1
    const code = lines.slice(start).join('\n')
    try {
      new Function(code) // eslint-disable-line no-new-func -- parse check only, never invoked
    } catch (err) {
      throw new Error(label + ': snippet failed to parse: ' + err.message)
    }
  }

  // The reference base obeys the same contract as the field: marker line, description, parses.
  {
    const lines = REFERENCE_BASE.split('\n')
    assert.strictEqual(lines[0], '// Team: the original', 'base: line 1 must be the exact team marker')
    assert.ok(lines[1] && lines[1].startsWith('// '), 'base: line 2 must be a one-line description')
    assert.ok(!CODE_LABELS.includes('the original'), 'base label must not collide with the field')
    let start = 0
    while (start < lines.length && lines[start].startsWith('//')) start += 1
    new Function(lines.slice(start).join('\n')) // eslint-disable-line no-new-func -- parse check only
  }

  console.log('sample-code-field ok: 32 artifacts + reference base')
}
