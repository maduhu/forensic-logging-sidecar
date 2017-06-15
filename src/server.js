'use strict'

const Uuid = require('uuid4')
const Logger = require('@leveloneproject/central-services-shared').Logger
const Config = require('./lib/config')
const KmsConnection = require('./kms/connection')

const sidecarId = Uuid()
const kmsConn = KmsConnection.create(Config.KMS)

module.exports = kmsConn.connect()
  .then(() => kmsConn.register(sidecarId))
  .catch(err => {
    Logger.error(err)
    throw err
  })
