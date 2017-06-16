'use strict'

const P = require('bluebird')
const WS = require('ws')
const Logger = require('@leveloneproject/central-services-shared').Logger

class KmsConnection {
  constructor (settings) {
    this._url = settings.URL || 'ws://localhost:8080/sidecar'
    this._connected = false
  }

  connect () {
    return new P((resolve, reject) => {
      if (this._connected) {
        return resolve(this)
      }

      this._websocket = new WS(this._url, {
        perMessageDeflate: false
      })

      this._websocket.on('open', () => {
        this._connected = true
        resolve(this)
      })

      this._websocket.on('close', this._onClose.bind(this))
      this._websocket.on('error', this._onError.bind(this))
    })
  }

  register (sidecarId) {
    return new P((resolve, reject) => {
      if (!this._connected) {
        return reject(new Error('You must connect before registering'))
      }

      const registerMessageId = `register-${sidecarId}`

      this._websocket.once('message', (data, flags) => {
        Logger.info(`Received message during registration procees: ${data}`)

        // Set the message handler to the default.
        this._websocket.on('message', this._onMessage.bind(this))

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

      this._sendMessage(registerMessageId, 'register', { id: sidecarId, serviceName: 'test' })
    })
  }

  _onMessage (data, flags) {
    Logger.info(`onMessage: ${data}`)
  }

  _onError (err) {
    Logger.error(err)
  }

  _onClose (code, reason) {
    Logger.info(`onClose: ${code} - ${reason}`)
  }

  _sendMessage (id, method, params) {
    this._websocket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
  }
}

exports.create = (settings) => {
  return new KmsConnection(settings || {})
}
