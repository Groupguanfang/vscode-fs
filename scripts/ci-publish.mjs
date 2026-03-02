#!/usr/bin/env node
/**
 * CI 发布脚本：使用 npm publish 以支持 OIDC Trusted Publishing
 * pnpm 不兼容 OIDC，必须使用 npm 直接发布
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8'),
)

const { name, version } = pkg

try {
  execSync(`npm view ${name}@${version} version`, { stdio: 'ignore' })
  console.log(`${name}@${version} already published, skipping`)
}
catch {
  console.log(`Publishing ${name}@${version}...`)
  execSync('npm publish --provenance', { stdio: 'inherit' })
}
