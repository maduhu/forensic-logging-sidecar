'use strict'

const P = require('bluebird')
const WS = require('ws')
const Moment = require('moment')
const EventEmitter = require('events')
const Logger = require('@leveloneproject/central-services-shared').Logger
const KeepAlive = require('./keep-alive')

class KmsConnection extends EventEmitter {
  constructor (settings) {
    super()

    this._url = settings.URL || 'ws://localhost:8080/sidecar'
    this._pingInterval = settings.PING_INTERVAL || 30000
    this._connected = false
  }

  connect () {
    return new P((resolve, reject) => {
      if (this._connected) {
        return resolve(this)
      }

      const connectErrorListener = (err) => {
        this._ws.removeAllListeners()
        reject(err)
      }

      // Create the websocket, and wait for either an open or error event to complete Promise.
      this._ws = new WS(this._url, {
        perMessageDeflate: false
      })

      this._ws.once('open', () => {
        this._connected = true

        // Remove listener only used for connect problems.
        this._ws.removeListener('error', connectErrorListener)

        // Attach the regular event listeners.
        this._ws.on('close', this._wsOnClose.bind(this))
        this._ws.on('error', this._wsOnError.bind(this))

        // Setup ping/pong.
        this._ws.on('ping', this._wsOnPing.bind(this))
        this._ws.on('pong', this._wsOnPong.bind(this))

        this._keepAlive = KeepAlive.create(this._ws, this._pingInterval)
        this._keepAlive.start()

        resolve(this)
      })

      this._ws.once('error', connectErrorListener)
    })
  }

  register (sidecarId, serviceName) {
    return new P((resolve, reject) => {
      if (!this._connected) {
        return reject(new Error('You must connect before registering'))
      }

      const registerMessageId = `register-${sidecarId}`

      this._ws.once('message', (data, flags) => {
        Logger.info('Received message during registration process')

        // Set the message handler to the default.
        this._ws.on('message', this._wsOnMessage.bind(this))

        const response = JSON.parse(data)
        if (response.id === registerMessageId) {
          if (response.result.id === sidecarId) {
            resolve({ batchKey: response.result.batchKey, rowKey: response.result.rowKey })
          } else {
            Logger.error(`Received register message for different sidecar from KMS during registration process: ${data}`)
            reject(new Error('Error during KMS registration process'))
          }
        } else {
          Logger.error(`Received non-register message from KMS during registration process: ${data}`)
          reject(new Error('Error during KMS registration process'))
        }
      })

      this.sendRequest(registerMessageId, 'register', { id: sidecarId, serviceName })
    })
  }

  sendRequest (id, method, params) {
    this._ws.send(this._buildJsonRPCMessage(id, { method, params }))
  }

  sendResponse (id, data) {
    this._ws.send(this._buildJsonRPCMessage(id, { result: data }))
  }

  sendErrorResponse (id, error) {
    this._ws.send(this._buildJsonRPCMessage(id, { error }))
  }

  _cleanup () {
    Logger.info('Cleaning up KMS connection')
    this._keepAlive.stop()
  }

  _buildJsonRPCMessage (id, data) {
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
    if (parsed.method === 'healthcheck') {
      this.emit('healthCheck', { id: parsed.id, level: parsed.params.level })
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
