import path from 'node:path'
import fs from 'node:fs'
import fetch from 'node-fetch'

import * as C from './conf.ts'
import { makeConsoleAndFileLogger } from './log.ts'

const baseUrl = new URL(C.config.substackBaseUrl)

const base = path.join(C.data, 'postList')
fs.rmSync(base, { recursive: true, force: true })
fs.mkdirSync(base, { recursive: true })
const log = makeConsoleAndFileLogger(path.join(base, 'log.txt'))

const batchSize = 20

const allPosts: any[] = []

let lastOffset = 0
while(true) {
    const iterLog = log.withIds('offset ' + lastOffset)
    try {
        const url = new URL('/api/v1/archive?sort=new&search=', baseUrl)
        url.searchParams.set('offset', '' + lastOffset)
        url.searchParams.set('limit', '' + batchSize)
        iterLog.i('Fetching at', url.toString())
        const resp = await fetch(url)
        if(!resp.ok) {
            const body = await resp.text().then(
                it => 'Body:' + it,
                it => 'Body error:' + it
            )
            throw new Error('Response status: ' + resp.status + '. Body: ' + body)
        }
        const dataStr = await resp.text()
        fs.writeFileSync(
            path.join(base, 'response' + lastOffset + '.json'),
            dataStr,
        )
        const data = JSON.parse(dataStr)
        iterLog.i('Received', data.length, 'entries')
        for(const it of data) {
            allPosts.push(it)
        }
        lastOffset += data.length
        if(data.length < batchSize) break
    }
    catch(err) {
        iterLog.e(err)
        break
    }
}

log.i('Done. Found', lastOffset, 'posts')

allPosts.reverse()
fs.writeFileSync(path.join(base, 'posts.json'), JSON.stringify(allPosts))
