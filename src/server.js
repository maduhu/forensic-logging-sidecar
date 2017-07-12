'use strict'

const Logger = require('@leveloneproject/central-services-shared').Logger
const Sidecar = require('./sidecar')
const Db = require('./lib/db')
const Config = require('./lib/config')
const Migrator = require('./lib/migrator')
const Package = require('../package')

const startSidecar = () => {
  const sidecar = Sidecar.create(buildSidecarSettings())

  return Migrator.migrate()
    .then(() => Db.connect(Config.DATABASE_URI))
    .then(() => sidecar.start())
    .then(() => Logger.info(`Sidecar ${sidecar.id} for ${sidecar.service} connected to KMS and listening for messages on port ${sidecar.port}`))
    .catch(err => {
      Logger.error('Fatal error thrown by sidecar', err)
      cleanup()
      throw err
    })
}

const buildSidecarSettings = () => {
  return {
    port: Config.PORT,
    serviceName: Config.SERVICE,
    batchSize: Config.BATCH_SIZE,
    version: Package.version,
    kmsUrl: Config.KMS.URL,
    kmsPingInterval: Config.KMS.PING_INTERVAL
  }
}

const cleanup = () => {
  Db.disconnect()
}

module.exports = startSidecar()
