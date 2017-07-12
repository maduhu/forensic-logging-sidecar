'use strict'

const Uuid = require('uuid4')
const Moment = require('moment')
const Logger = require('@leveloneproject/central-services-shared').Logger
const SocketListener = require('./socket')
const KmsConnection = require('./kms')
const HealthCheck = require('./health-check')
const EventService = require('./domain/event')
const BatchService = require('./domain/batch')
const BatchTracker = require('./domain/batch/tracker')

class Sidecar {
  constructor (settings) {
    this.id = Uuid()
    this.port = settings.port
    this.service = settings.serviceName

    this.startTime = Moment.utc()
    this.version = settings.version

    this._sequence = 0

    this._kmsConnection = KmsConnection.create({ url: settings.kmsUrl, pingInterval: settings.kmsPingInterval })
    this._kmsConnection.on('healthCheck', this._onHealthCheckRequest.bind(this))

    this._socketListener = SocketListener.create()
    this._socketListener.on('message', this._onSocketMessage.bind(this))

    this._batchTracker = BatchTracker.create({ batchSize: settings.batchSize })
    this._batchTracker.on('batchReady', this._onBatchReady.bind(this))
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

  _onHealthCheckRequest (request) {
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
        this._batchTracker.eventCreated(event.eventId)
      })
  }

  _onBatchReady (eventIds) {
    BatchService.create(this.id, eventIds, this._batchKey)
      .then(batch => {
        Logger.info(`Created batch ${batch.batchExternalId} of ${eventIds.length} events`)
      })
  }
}

exports.create = (settings) => {
  return new Sidecar(settings)
}
