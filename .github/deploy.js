const npmPublish = require('@jsdevtools/npm-publish')
const spawn = require('cross-spawn')

module.exports.deploy = async () => {
    try {
        await run_process(['tsc'])
        await npmPublish({
            package: './package.json',
            token: process.env.NPM_TOKEN
        })
    } catch (error) {
        process.exit(1)
    }
}

const run_process = async arg_list => {
    return new Promise((resolve, reject) => {
        console.log(`Executing: ${arg_list.join(' ')}`)
        const child_process = spawn(arg_list[0], arg_list.slice(0, -1), { stdio: 'pipe' })

        let output = []
        let err = []
        child_process.stdout.on('data', data => {
            // console.log(data.toString())
            output.push(data.toString())
        })
        child_process.stderr.on('data', data => {
            // console.error(data.toString())
            err.push(data.toString())
        })
        child_process.on('close', code => {
            if (code !== 0) reject(err)
            resolve(output)
        })
    })
}
