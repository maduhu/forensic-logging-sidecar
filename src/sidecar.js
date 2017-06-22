'use strict'

const Uuid = require('uuid4')
const SocketListener = require('./socket')
const KmsConnection = require('./kms')
const EventService = require('./domain/event')

class Sidecar {
  constructor (settings) {
    this._id = Uuid()
    this._port = settings.PORT
    this._service = settings.SERVICE
    this._sequence = 0
    this._unbatchedEvents = []

    this._kmsConnection = KmsConnection.create(settings.KMS)

    this._socketListener = SocketListener.create()
    this._socketListener.on('message', this._handleMessage.bind(this))
  }

  start () {
    return this._kmsConnection.connect()
      .then(() => this._kmsConnection.register(this._id, this._service))
      .then(keys => {
        this._batchKey = keys.batchKey
        this._rowKey = keys.rowKey
      })
      .then(() => this._socketListener.listen(this._port))
  }

  _handleMessage (message) {
    this._sequence += 1

    EventService.create(this._id, this._sequence, message, this._rowKey)
      .then(event => {
        this._unbatchedEvents.push(event.eventId)
      })
  }
}

exports.create = (settings) => {
  return new Sidecar(settings)
}
