'use strict'

const Jfrog = require('./jfrog')
const Variables = require('./variables')

const deploy = () => {
  const version = Variables.VERSION
  Jfrog.login()
    .then(() => Jfrog.pushImageToJFrog(Variables.IMAGE, version))
    .catch(e => {
      console.error(e)
      process.exit(1)
    })
}

module.exports = deploy()
