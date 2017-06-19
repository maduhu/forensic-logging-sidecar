'use strict'

const Logger = require('@leveloneproject/central-services-shared').Logger
const Sidecar = require('./sidecar')
const Config = require('./lib/config')

const sidecar = Sidecar.create(Config)

module.exports = sidecar.start()
  .then(() => Logger.info('Sidecar running and listening'))
  .catch(err => {
    Logger.error(err)
    throw err
  })
