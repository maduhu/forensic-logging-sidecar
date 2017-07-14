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

    this._kmsConnection = KmsConnection.create({ url: settings.kmsUrl, pingInterval: settings.kmsPingInterval, requestTimeout: settings.kmsRequestTimeout })
    this._kmsConnection.on('inquiry', this._onInquiryRequest.bind(this))
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

  _onInquiryRequest (request) {
    Logger.info(`Received inquiry ${request.inquiryId} from KMS`)
    BatchService.findForTimespan(request.startTime, request.endTime)
      .then(found => Logger.info(`Found ${found.length} batches for inquiry ${request.inquiryId}`))
  }

  _onHealthCheckRequest (request) {
    Logger.info(`Received ${request.level} health check request ${request.id} from KMS`)
    if (request.level === 'ping') {
      HealthCheck.ping(this).then(hc => {
        Logger.info(`Sending ping health check response ${request.id} to KMS`)
        this._kmsConnection.respond(request, hc)
      })
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
        return this._kmsConnection.request('batch', { 'id': batch.batchExternalId, 'signature': batch.signature })
      })
      .then(response => Logger.info(`Sent batch ${response.id} successfully to KMS`))
      .catch(e => Logger.error('Error received while creating batch and sending to KMS', e))
  }
}

exports.create = (settings) => {
  return new Sidecar(settings)
}
