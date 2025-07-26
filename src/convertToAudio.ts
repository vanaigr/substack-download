import path from 'node:path'
import fs from 'node:fs'
import proc from 'node:child_process'

import * as C from './conf.ts'
import * as U from './util.ts'
import { makeConsoleAndFileLogger } from './log.ts'

const base = path.join(C.data, 'audio')
fs.rmSync(base, { recursive: true, force: true })
fs.mkdirSync(base, { recursive: true })
const baseLog = makeConsoleAndFileLogger(path.join(base, 'log.txt'))

const rawPostsDir = path.join(C.data, 'rawPosts')
const externalDir = path.join(C.data, 'externalFiles')

type AssetsIndex = {
    videoPaths: Record<string, string>
    imagePaths: Record<string, string>
}

let assetsIndex: AssetsIndex = {
    videoPaths: {},
    imagePaths: {},
}

try {
    assetsIndex = JSON.parse(fs.readFileSync(path.join(externalDir, 'index.json')).toString()) as AssetsIndex
}
catch(err) {
    baseLog.e('While creating asset index')
    throw err
}

const postList = JSON.parse(fs.readFileSync(path.join(C.data, 'postList', 'posts.json')).toString())

const nameCounts = new Map<string, number>()
nameCounts.set('index', 1)
for(const post of postList) {
    const title = post.slug
    let count = nameCounts.get(title) ?? 0
    nameCounts.set(title, count + 1)
}

const idToName: Record<string, string> = {}
for(const post of postList) {
    let title = post.slug
    if(nameCounts.get(title)! > 1) {
        title = title + '-' + post.id
    }
    idToName[post.id] = title
}

for(const post of postList) {
    const log = baseLog.withIds('post ' + post.id)
    try {
        log.i('Processing')

        const values = U.extractValues(
            fs.readFileSync(path.join(rawPostsDir, post.id + '.html')).toString(),
            log,
        )
        if(!values) {
            log.w('Could not find post html. Skipping')
            continue
        }

        const { html, videoUpload } = U.getPostData(values)
        if(!html) {
            log.e('Could not find body_html of the post. Skipping')
            continue
        }

        if(videoUpload) {
            const filename = assetsIndex.videoPaths[videoUpload.id]
            if(!filename) {
                log.w('Missing video', videoUpload.id)
            }
            else {
                log.i('Converting')
                // TODO: parallelize (I don't have cores to spare)
                proc.spawnSync(
                    'ffmpeg',
                    [
                        '-i', path.join(externalDir, encodeURIComponent(filename)),
                        '-q:a', '0',
                        '-map', 'a',
                        path.join(base, idToName[post.id] + '.ogg'),
                    ],
                    // TODO: also output into a log
                    { stdio: 'inherit' },
                )
            }
        }
    }
    catch(err) {
        log.e(err)
    }
}

baseLog.i('Done')
