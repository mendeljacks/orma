require("sucrase/register/ts")

const Ajv = require('ajv');
const { mutate_validation_schema } = require('../mutate/mutate_validation');
const standaloneCode = require('ajv/dist/standalone');
const { writeFileSync } = require('fs');

module.exports.compile_validation = () => {
    const ajv = new Ajv({ code: { source: true }, discriminator: true })
    const mutation_validation = ajv.compile(mutate_validation_schema)
    const mutation_validation_code = standaloneCode(ajv, mutation_validation)
    writeFileSync('./src/mutate/mutate_validations_generated.js', mutation_validation_code)
}