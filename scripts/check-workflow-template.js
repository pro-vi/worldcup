'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
for (const relative of [
  'worldcup/references/workflow-template.js',
  'worldcup/references/workflow-judge-agent-probe.js',
]) {
  const file = path.join(root, relative)
  let src = fs.readFileSync(file, 'utf8')
  // Workflow scripts allow top-level await and `export const meta`; local Node syntax checking
  // parses the same body inside an async function.
  src = src.replace(/^export const meta/m, 'const meta')
  new Function(`return (async function __workflow__(){\n${src}\n})`)
  console.log(`${relative} parse ok`)
}
