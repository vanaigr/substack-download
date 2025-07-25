import path from 'node:path'
import fs from 'node:fs'
import fetch from 'node-fetch'

import * as C from './conf.ts'
import * as U from './util.ts'
import { makeConsoleAndFileLogger } from './log.ts'

const base = path.join(C.data, 'rawPosts')
fs.mkdirSync(base, { recursive: true })
const baseLog = makeConsoleAndFileLogger(path.join(base, 'log.txt'))

const cookie = U.makeCookie(baseLog)

const posts = JSON.parse(fs.readFileSync(
    path.join(C.data, 'postList', 'posts.json')
).toString('utf8')) as any[]

for(let i = 0; i < posts.length; i++) {
    const post = posts[i]
    const filePath = path.join(base, post.id + '.html')

    const postLog = baseLog.withIds('post ' + post.id)
    postLog.i('Processing', 1 + i, 'of', posts.length)

    if(fs.existsSync(filePath)) {
        postLog.i('Already exists. Skipping')
        continue
    }

    if(post.audience === 'only_paid') {
        postLog.w('Post is subscriber-only')
        //postLog.w('Skipping since it is paid only')
        //continue
    }

    let retries = 0
    const timeouts = [30, 5 * 60, 10 * 60]

    while(true) {
        const log = retries > 0
            ? postLog.withIds('retry ' + retries)
            : postLog

        try {
            log.i('Fetching from', post.canonical_url)
            const resp = await fetch(post.canonical_url, {
                headers: { ...(cookie ? { cookie } : {}) },
            })
            if(!resp.ok) {
                const body = await resp.text().then(
                    it => 'body:' + it,
                    it => 'body error:' + it
                )
                throw new Error('Response status: ' + resp.status + '. Body: ' + body)
            }
            const text = await resp.text()
            fs.writeFileSync(filePath, text)

            break
        }
        catch(err) {
            log.e(err)
            if(retries >= timeouts.length) {
                log.w('Maximum retries reached. Skipping')
                break
            }

            const timeout = timeouts[retries]
            const min = Math.floor(timeout / 60)
            const sec = timeout - min * 60
            log.i(
                'Failed to load. Retrying after',
                min + ':' + sec.toString().padStart(2, '0'),
            )
            await new Promise(s => setTimeout(s, timeout * 1000))

            retries++
        }
    }

    postLog.i('Done. Waiting to avoid rate-limit')
    await new Promise(s => setTimeout(s, 2000))
}
