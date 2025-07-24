import path from 'node:path'
import fs from 'node:fs'
import fetch from 'node-fetch'
import puppeteer from 'puppeteer'

import * as C from './conf.ts'
import { makeConsoleAndFileLogger } from './log.ts'

const base = path.join(C.data, 'setupCookie')
fs.rmSync(base, { recursive: true, force: true })
fs.mkdirSync(base, { recursive: true })
const log = makeConsoleAndFileLogger(path.join(base, 'log.txt'))

log.i('Sign in and wait until redirected to /home')

const browser = await puppeteer.launch({ headless: false })
const page = await browser.newPage()
await page.goto('https://substack.com/sign-in')
await page.waitForFunction(
    () => location.href === 'https://substack.com/home',
    { timeout: 0 },
)
const cookies = await browser.cookies()
log.i('Saving cookies')

fs.writeFileSync(path.join(base, 'rawCookies.json'), JSON.stringify(cookies))

await browser.close()
