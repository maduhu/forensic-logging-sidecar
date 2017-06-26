'use strict'

const Uuid = require('uuid4')
const Moment = require('moment')
const Logger = require('@leveloneproject/central-services-shared').Logger
const SocketListener = require('./socket')
const KmsConnection = require('./kms')
const HealthCheck = require('./health-check')
const EventService = require('./domain/event')
const Package = require('../package')

class Sidecar {
  constructor (settings) {
    this.id = Uuid()
    this.port = settings.PORT
    this.service = settings.SERVICE

    this.startTime = Moment.utc()
    this.version = Package.version

    this._sequence = 0
    this._unbatchedEvents = []

    this._kmsConnection = KmsConnection.create(settings.KMS)
    this._kmsConnection.on('healthCheck', this._onKmsHealthCheck.bind(this))

    this._socketListener = SocketListener.create()
    this._socketListener.on('message', this._onSocketMessage.bind(this))
  }

  start () {
    return this._kmsConnection.connect()
      .then(() => this._kmsConnection.register(this.id, this.service))
      .then(keys => {
        this._batchKey = keys.batchKey
        this._rowKey = keys.rowKey
      })
      .then(() => this._socketListener.listen(this.port))
  }

  _onKmsHealthCheck (request) {
    Logger.info(`Received KMS health check request ${JSON.stringify(request)}`)
    if (request.level === 'ping') {
      HealthCheck.ping(this)
        .then(hc => this._kmsConnection.sendResponse(request.id, hc))
    }
  }

  _onSocketMessage (message) {
    this._sequence += 1

    EventService.create(this.id, this._sequence, message, this._rowKey)
      .then(event => {
        Logger.info(`Created event ${event.eventId} with sequence ${event.sequence}`)
        this._unbatchedEvents.push(event.eventId)
      })
  }
}

exports.create = (settings) => {
  return new Sidecar(settings)
}
