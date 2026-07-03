'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const file = path.join(root, 'worldcup/references/workflow-template.js')
let src = fs.readFileSync(file, 'utf8')

// The template is pasted into an ultracode Workflow script where `export const meta`
// is valid. For local syntax checking, parse the body inside an async function.
src = src.replace(/^export const meta/m, 'const meta')
new Function(`return (async function __workflow__(){\n${src}\n})`)

console.log('workflow-template parse ok')
