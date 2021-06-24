const npmPublish = require("@jsdevtools/npm-publish");

module.exports.deploy = async () => {
    // Run npm-publish with options
    await npmPublish({
        package: "./package.json",
        token: process.env.NPM_TOKEN
    });
}