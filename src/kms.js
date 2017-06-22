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
        this._ws.on('close', this._onClose.bind(this))
        this._ws.on('error', this._onError.bind(this))

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
        Logger.info(`Received message during registration procees: ${data}`)

        // Set the message handler to the default.
        this._ws.on('message', this._onMessage.bind(this))

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

      this._sendMessage(registerMessageId, 'register', { id: sidecarId, serviceName })
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
    this._ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
  }
}

exports.create = (settings) => {
  return new KmsConnection(settings || {})
}
