'use strict'

const Logger = require('@leveloneproject/central-services-shared').Logger
const Sidecar = require('./sidecar')
const Db = require('./lib/db')
const Config = require('./lib/config')
const Migrator = require('./lib/migrator')

module.exports = Migrator.migrate()
  .then(() => Db.connect(Config.DATABASE_URI))
  .then(() => {
    const sidecar = Sidecar.create(Config)
    return sidecar.start()
  })
  .then(() => Logger.info('Sidecar running and listening'))
  .catch(err => {
    Logger.error(err)
    throw err
  })
