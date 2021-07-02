const inspector = require('inspector')
const util = require('util')
let session = new inspector.Session()
session.connect()
let post = util.promisify(session.post.bind(session))

const fs = require('fs')
let write_file = util.promisify(fs.writeFile)


let profiler_running = false
export const start_profiler = async () => {
    if (profiler_running) {
        throw new Error('Profiler already running, try again later')
    }

    profiler_running = true

    try {
        await post('Profiler.enable')
        await post('Profiler.start')
    } catch (er) {
        console.error('Profiler error:', er)
    }
}

export const stop_profiler = async () => {
    try {
        const profile = (await post('Profiler.stop')).profile
        let file_name = `profile_${Date.now()}.cpuprofile`
        await write_file(file_name, JSON.stringify(profile))
        console.error('Profile written to', file_name)
    } catch (er) {
        console.error('Profiler error:', er)
    } finally {
        await post('Profiler.disable')
        profiler_running = false
    }
}