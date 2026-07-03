#!/usr/bin/env node
'use strict'

// Render the committed showcase tournaments: run worldcup/references/workflow-template.js
// end-to-end against the deterministic fake judge (scripts/workflow-harness.js) and write the
// resulting HTML reports under docs/media/. Two fields ship:
//   - taglines: 32 tagline-flavored variant names (lorem bodies) — the prose-shaped sample
//   - code:     32 real JavaScript debounce implementations (scripts/sample-code-field.js),
//               one disqualified for a fabricated benchmark claim — the code-shaped sample
//
//   node scripts/render-sample-report.js            # (re)generate both files
//   node scripts/render-sample-report.js --check    # drift guard: fail if a committed file differs
//
// Everything is deterministic (no RNG, no clock, hash-decided matches), so re-running against
// an unchanged template reproduces the same files byte-for-byte — which is what --check asserts
// (npm run check runs it, so a template change that alters the reports must recommit the samples).

const fs = require('node:fs')
const path = require('node:path')
const { runTournament } = require('./workflow-harness.js')
const { CODE_LABELS, DQ_LABEL: CODE_DQ, REFERENCE_INCUMBENT, codeArtifact } = require('./sample-code-field.js')

// 32 product-tagline-flavored variant names (trademark-clean; no countries, no clubs).
const LABELS = [
  'the deadpan one', 'cold-open', 'tiki-taka', 'the one-liner',
  'total-football', 'counter-press', 'false-nine', 'park-the-bus',
  'route-one', 'the slow-burn', 'the cliffhanger', 'the mic-drop',
  'the understatement', 'the nutmeg', 'the rabona', 'the bicycle-kick',
  'catenaccio', 'the high-line', 'the low-block', 'the set-piece',
  'the through-ball', 'the overlap', 'the wonderkid', 'the journeyman',
  'the target-man', 'the playmaker', 'the sweeper', 'the super-sub',
  'the golazo', 'the hat-trick', 'the extra-time', 'the overclaimer',
]

// A real incumbent per field, so each sample's reference challenge is played against an actual
// original instead of the template's FILL placeholder — whatever the (hash-decided) outcome, the
// showcased "beat / keep the original" verdict then describes a real match. Markers are how the
// deterministic fake judge recovers identity (see workflow-harness.js).
const TAGLINE_INCUMBENT = [
  'Team: the original',
  'The tagline that has shipped on the landing page all along: plain, honest, a little dry — the line every variant in this field was asked to beat.',
  'One sentence, no hype; the incumbent bar the champion must clearly clear, or the recommendation is to keep it.',
].join('\n\n')

const MEDIA = path.join(__dirname, '..', 'docs', 'media')
const SAMPLES = [
  // One scripted gate kill per field so each sample shows the fabrication gate doing its job.
  { name: 'taglines', out: path.join(MEDIA, 'sample-report.html'), labels: LABELS, dqLabel: 'the overclaimer', artifactFor: null, incumbent: TAGLINE_INCUMBENT },
  { name: 'code', out: path.join(MEDIA, 'sample-report-code.html'), labels: CODE_LABELS, dqLabel: CODE_DQ, artifactFor: codeArtifact, incumbent: REFERENCE_INCUMBENT },
]

async function renderOne({ name, out, labels, dqLabel, artifactFor, incumbent }, checkMode) {
  const { result, unknown } = await runTournament({ labels, dqLabel, artifactFor, incumbent })
  if (result.error) throw new Error(`[${name}] template returned an error: ${result.error}`)
  if (unknown.length) throw new Error(`[${name}] fake judge missed agent roles:\n  ${unknown.join('\n  ')}`)
  if (checkMode) {
    const committed = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null
    if (committed !== result.reportHtml) {
      throw new Error(`sample-report drift (${name}): ${path.relative(process.cwd(), out)} no longer matches the template's deterministic output — rerun \`node scripts/render-sample-report.js\` and commit the result`)
    }
    console.log(`sample-report ok (${name}): committed file matches the deterministic render`)
    return
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, result.reportHtml)
  console.log(`[${name}] champion: ${result.champion.label} (${result.trust.verdict})`)
  console.log(`[${name}] disqualified: ${result.disqualified.map(d => `${d.label} [${d.category}]`).join(', ') || 'none'}`)
  console.log(`[${name}] wrote ${path.relative(process.cwd(), out)} (${Buffer.byteLength(result.reportHtml).toLocaleString()} bytes)`)
}

async function main() {
  const checkMode = process.argv.includes('--check')
  for (const sample of SAMPLES) await renderOne(sample, checkMode)
}

main().catch(e => { console.error(e.message || e); process.exit(1) })
