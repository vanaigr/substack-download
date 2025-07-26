import path from 'node:path'
import fs from 'node:fs'
import proc from 'node:child_process'

import * as C from './conf.ts'
import * as U from './util.ts'
import { makeConsoleAndFileLogger } from './log.ts'

const base = path.join(C.data, 'audio')
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

const audioIndexPath = path.join(base, 'index.json')

let audioIndex: Record<string, string> = {}
function writeIndex() {
    fs.writeFileSync(audioIndexPath, JSON.stringify(audioIndex, undefined, 2))
}

let audioIndexStr: Buffer | undefined
try {
    audioIndexStr = fs.readFileSync(audioIndexPath)
}
catch(err) {
    baseLog.w('index.json not found. Starting from scratch')
}

try {
    if(audioIndexStr) {
        audioIndex = JSON.parse(audioIndexStr.toString())
    }
}
catch(err) {
    baseLog.w('While reading audio index', err)
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
            const name = idToName[post.id]
            const audioFilename = name + '.mp3'

            if(audioIndex[name]) {
                log.i('Exists. Skipping')
                continue
            }

            const videoFilename = assetsIndex.videoPaths[videoUpload.id]
            if(!videoFilename) {
                log.w('Missing video', videoUpload.id)
            }
            else {
                log.i('Converting')
                // TODO: parallelize (I don't have cores to spare)
                proc.spawnSync(
                    'ffmpeg',
                    [
                        '-y',
                        '-i', path.join(externalDir, encodeURIComponent(videoFilename)),
                        '-q:a', '0',
                        '-map', 'a',
                        path.join(base, audioFilename),
                    ],
                    // TODO: also output into a log
                    { stdio: 'inherit' },
                )
                audioIndex[name] = audioFilename
                writeIndex()
            }
        }
    }
    catch(err) {
        log.e(err)
    }
}

baseLog.i('Done')
