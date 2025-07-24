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

log.i('Sign in and close the tab')
log.w('NOT SUBSCRIBE. SIGN IN. Why did they make a subscribe button that signs you in but then doesn\'t sign you in 🤔')
log.w('MAKE SURE YOU ARE SIGNED IN BY OPENING PAID-FOR CONTENT (why does it not sign in until I sign in twice 😭😭😭)')

const browser = await puppeteer.launch({ headless: false })
const page = await browser.newPage()
await page.goto(C.config.substackBaseUrl)
try {
    await new Promise(resolve => page.once('close', resolve))
}
catch(err) {
    log.e(err)
    log.e('Got error. Will still get cookies')
}

const cookies = await browser.cookies()
log.i('Saving cookies')

fs.writeFileSync(path.join(base, 'rawCookies.json'), JSON.stringify(cookies))

await browser.close()
