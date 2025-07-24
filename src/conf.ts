import path from 'node:path'
import config from '../config.ts'

export const data = path.resolve(
    path.join(import.meta.dirname, '..'),
    config.dataDirectory
)

export { config }
