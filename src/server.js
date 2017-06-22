'use strict'

const Logger = require('@leveloneproject/central-services-shared').Logger
const Sidecar = require('./sidecar')
const Db = require('./lib/db')
const Config = require('./lib/config')
const Migrator = require('./lib/migrator')

const sidecar = Sidecar.create(Config)

module.exports = Migrator.migrate()
  .then(() => Db.connect(Config.DATABASE_URI))
  .then(() => sidecar.start())
  .then(() => Logger.info('Sidecar running and listening'))
  .catch(err => {
    Logger.error(err)

    // Cleanup
    Db.disconnect()

    throw err
  })
