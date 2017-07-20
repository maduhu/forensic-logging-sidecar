'use strict'

const P = require('bluebird')
const WS = require('ws')
const Uuid = require('uuid4')
const Moment = require('moment')
const EventEmitter = require('events')
const Logger = require('@leveloneproject/central-services-shared').Logger
const Requests = require('./requests')
const KeepAlive = require('./keep-alive')
const Errors = require('../errors')
const SymmetricCrypto = require('../crypto/symmetric')
const AsymmetricCrypto = require('../crypto/asymmetric')

class KmsConnection extends EventEmitter {
  constructor (settings) {
    super()

    this._url = settings.url || 'ws://localhost:8080/sidecar'
    this._pingInterval = settings.pingInterval || 30000
    this._timeout = settings.requestTimeout || 5000
    this._connectTimeout = settings.connectTimeout || 30000
    this._reconnectInterval = settings.reconnectInterval || 5000

    this._pendingRequests = Requests.create({ timeout: this._timeout })

    this._connected = false
    this._connectPromise = null
    this._connectTimer = null
    this._reconnectTimer = null
  }

  connect () {
    return new P((resolve, reject) => {
      if (this._connected) {
        return resolve(this)
      }

      this._connectPromise = { resolve, reject }

      this._connectTimer = setTimeout(this._connectTimedOut.bind(this), this._connectTimeout)

      this._connect()
    })
  }

  register (sidecarId, serviceName) {
    return P.try(() => {
      if (!this._connected) {
        throw new Error('You must connect before registering')
      }

      return this.request('register', { id: sidecarId, serviceName })
        .then(registerResponse => {
          const rowKey = registerResponse.rowKey
          const batchKey = registerResponse.batchKey
          const challenge = registerResponse.challenge

          // Send challenge request to KMS.
          const rowSignature = SymmetricCrypto.sign(challenge, rowKey)
          const batchSignature = AsymmetricCrypto.sign(challenge, batchKey)

          return this.request('challenge', { rowSignature, batchSignature })
            .then(challengeResponse => {
              if (challengeResponse.status.toUpperCase() !== 'OK') {
                return P.reject(new Errors.KmsRegistrationError(`Received invalid status from KMS during challenge: ${challengeResponse.status}`))
              }

              return { batchKey, rowKey }
            })
        })
    })
  }

  respondToHealthCheck (request, hcResult) {
    this.respond(request.id, hcResult)
  }

  respondToInquiry (request, inquiryResults) {
    const method = 'inquiry-response'
    const total = inquiryResults.length

    if (total > 0) {
      let item = 0

      inquiryResults.forEach(b => {
        item += 1
        Logger.info(`Sending batch ${b.batchId} for inquiry ${request.inquiryId}, item ${item} of total ${total}`)
        this._send({ method, params: { inquiry: request.inquiryId, id: b.batchId, body: b.data, total, item } })
      })
    } else {
      this._send({ method, params: { inquiry: request.inquiryId, total: 0, item: 0 } })
    }
  }

  sendBatch (batch) {
    return this.request('batch', { 'id': batch.batchId, 'signature': batch.signature })
  }

  request (method, params) {
    return this._pendingRequests.start(id => {
      this._send({ id, method, params })
    })
    .then(response => {
      if (response.error) {
        return P.reject(new Errors.KmsResponseError(response.error.id, response.error.message))
      }
      return response.result
    })
  }

  respond (requestId, result) {
    this._ws.send(this._buildJsonRpcMessage(requestId, { result }))
  }

  respondError (requestId, error) {
    this._ws.send(this._buildJsonRpcMessage(requestId, { error }))
  }

  _connect () {
    const connectErrorListener = (err) => {
      this._ws.removeAllListeners()

      switch (err.code) {
        case 'ECONNREFUSED':
          Logger.info(`Error connecting to KMS, attempting to connect after sleeping ${this._reconnectInterval}ms`)

          let self = this
          this._reconnectTimer = setTimeout(() => {
            self._connect()
          }, this._reconnectInterval)
          break
        default:
          this._clearConnectionTimers()
          this._connectError(err)
      }
    }

    // Create the websocket, and wait for either an open or error event to complete Promise.
    this._ws = new WS(this._url, {
      perMessageDeflate: false
    })

    this._ws.once('open', () => {
      this._connected = true

      this._clearConnectionTimers()

      // Remove listener only used for connect problems.
      this._ws.removeListener('error', connectErrorListener)

      // Attach the regular event listeners.
      this._ws.on('close', this._wsOnClose.bind(this))
      this._ws.on('error', this._wsOnError.bind(this))
      this._ws.on('message', this._wsOnMessage.bind(this))

      // Setup ping/pong.
      this._ws.on('ping', this._wsOnPing.bind(this))
      this._ws.on('pong', this._wsOnPong.bind(this))

      this._keepAlive = KeepAlive.create(this._ws, this._pingInterval)
      this._keepAlive.start()

      this._connectSuccessful(this)
    })

    this._ws.once('error', connectErrorListener)
  }

  _connectTimedOut () {
    this._ws.removeAllListeners()
    this._clearConnectionTimers()
    this._connectError(new Error(`Unable to connect to KMS within ${this._connectTimeout}ms`))
  }

  _connectError (err) {
    this._connectPromise.reject(err)
    this._connectPromise = null
  }

  _connectSuccessful (obj) {
    this._connectPromise.resolve(obj)
    this._connectPromise = null
  }

  _clearConnectionTimers () {
    clearTimeout(this._connectTimer)
    this._connectTimer = null

    clearTimeout(this._reconnectTimer)
    this._reconnectTimer = null
  }

  _send ({ id, method, params }) {
    if (!id) {
      id = Uuid()
    }
    this._ws.send(this._buildJsonRpcMessage(id, { method, params }))
  }

  _cleanup () {
    Logger.info('Cleaning up KMS connection')
    this._keepAlive.stop()
  }

  _isJsonRpc (data) {
    return data.jsonrpc && data.jsonrpc === '2.0'
  }

  _isJsonRpcRequest (data) {
    return this._isJsonRpc(data) && data.method
  }

  _buildJsonRpcMessage (id, data) {
    data['id'] = id
    data['jsonrpc'] = '2.0'
    return JSON.stringify(data)
  }

  // Websocket event handlers
  _wsOnPing (data) {
    this._ws.pong(data)
  }

  _wsOnPong (data) {
    const timestamp = Moment(JSON.parse(data).timestamp)
    const elapsed = Moment.utc().diff(timestamp)
    Logger.info(`Received pong, elapsed ${elapsed}ms`)
  }

  _wsOnMessage (data, flags) {
    let parsed = JSON.parse(data)

    if (this._isJsonRpc(parsed)) {
      let id = parsed.id

      if (this._isJsonRpcRequest(parsed)) {
        // This is a request from the KMS, emit the appropriate event.
        switch (parsed.method.toLowerCase()) {
          case 'healthcheck':
            this.emit('healthCheck', { id, level: parsed.params.level })
            break
          case 'inquiry':
            this.emit('inquiry', { id, inquiryId: parsed.params.inquiry, startTime: parsed.params.startTime, endTime: parsed.params.endTime })
            break
          default:
            Logger.warn(`Unhandled request from KMS received: ${data}`)
        }
      } else {
        if (this._pendingRequests.exists(id)) {
          // This is a response to a pending request, resolve with the parsed response.
          this._pendingRequests.complete(id, { result: parsed.result, error: parsed.error })
        } else {
          Logger.warn(`Unknown response sent for id ${id}: ${data}`)
        }
      }
    } else {
      Logger.warn(`Invalid message format received from KMS: ${data}`)
    }
  }

  _wsOnError (err) {
    Logger.error('Error on KMS websocket connection', err)
    this._cleanup()
  }

  _wsOnClose (code, reason) {
    Logger.info(`KMS websocket connection closed: ${code} - ${reason}`)
    this._cleanup()
  }
}

exports.create = (settings) => {
  return new KmsConnection(settings || {})
}
