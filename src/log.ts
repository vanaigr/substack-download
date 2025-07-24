import fsp from 'node:fs/promises'
import util from 'node:util'
import { Temporal as T } from 'temporal-polyfill'

export type Log = {
    withIds: (...ids: unknown[]) => Log
    log: (...values: unknown[]) => void
    i: (...values: unknown[]) => void
    w: (...values: unknown[]) => void
    e: (...values: unknown[]) => void
    // adds filler so that indentation of the previous logged line matches
    cont: (...values: unknown[]) => void
}

export type Channel = 'I' | 'E' | 'W' | '-' | undefined
export type RawLog = (
    ids: unknown[],
    channel: Channel,
    values: unknown[],
) => void

export function makeLogger(rawLog: RawLog): Log {
    return makeLoggerInner(rawLog, [])
}

function makeLoggerInner(rawLog: RawLog, ids: unknown[]): Log {
    return {
        withIds: (...ids2) => makeLoggerInner(rawLog, [...ids, ...ids2]),
        log: (...vs) => wrapLog(rawLog, ids, undefined, vs),
        i: (...vs) => wrapLog(rawLog, ids, 'I', vs),
        w: (...vs) => wrapLog(rawLog, ids, 'W', vs),
        e: (...vs) => wrapLog(rawLog, ids, 'E', vs),
        cont: (...vs) => wrapLog(rawLog, ids, '-', vs)
    }
}

function wrapLog(rawLog: RawLog, ids: unknown[], channel: Channel, vs: unknown[]) {
    try {
        rawLog(ids, channel, vs)
    }
    catch(err) {
        try { console.error(err) }
        catch(_) {}
    }
}

export function makeConsoleAndFileLogger(logPath: string | undefined) {
    let logP = Promise.resolve()
    const log = (ids: unknown[], c: Channel, vs: unknown[]) => {
        const dt = T.Now.zonedDateTimeISO()
        const date = dt.toLocaleString(undefined, {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
        })
        const time = dt.toLocaleString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        })
        let off = dt.offset
        if(off.endsWith(':00')) {
            off = off.substring(0, off.length - 3)
            const offInt = parseInt(off)
            if(isFinite(offInt)) {
                off = offInt.toString()
            }
        }

        const line: unknown[] = []
        line.push(`[${date} ${time} ${off}]`)
        for(const it of ids) {
            line.push(`[${it}]`)
        }
        if(c === '-') {
            line.push('--')
        }
        else if(typeof c === 'string') {
            line.push(c + ':')
        }
        for(const it of vs) {
            line.push(it)
        }

        console.log(...line)

        logP = logP.then(async() => {
            if(logPath == undefined) return

            const file = await fsp.open(logPath, 'a')
            try {
                const str = line.map(it => util.format(it)).join(' ') + '\n'
                file.write(str)
            }
            finally {
                file.close()
            }
        })
    }

    return makeLogger(log)
}

export type LogData = {
    ids: unknown[]
    channel: Channel
    vs: unknown[]
}

export function makeTestingLogger(): [Log, LogData[]] {
    const logs: LogData[] = []
    const log: RawLog = (ids, channel, vs) => {
        logs.push({ ids, channel, vs })
    }
    const logger = makeLogger(log)
    return [logger, logs]
}
