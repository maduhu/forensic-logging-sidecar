'use strict'

const Uuid = require('uuid4')
const Logger = require('@leveloneproject/central-services-shared').Logger
const EventSocket = require('./event-socket')
const KmsConnection = require('../kms/connection')

class Sidecar {
  constructor (settings) {
    this._id = Uuid()
    this._port = settings.PORT
    this._service = settings.SERVICE

    this._kmsConnection = KmsConnection.create(settings.KMS)

    this._eventSocket = EventSocket.create()
    this._eventSocket.on('message', this._handleMessage)
  }

  start () {
    return this._kmsConnection.connect()
      .then(() => this._kmsConnection.register(this._id, this._service))
      .then(keys => {
        this._batchKey = keys.batchKey
        this._rowKey = keys.rowKey
      })
      .then(() => this._eventSocket.listen(this._port))
  }

  _handleMessage (message) {
    Logger.info(`Received message ${message}`)
  }
}

exports.create = (settings) => {
  return new Sidecar(settings)
}
