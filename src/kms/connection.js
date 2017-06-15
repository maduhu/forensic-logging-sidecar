'use strict'

const P = require('bluebird')
const WS = require('ws')
const Logger = require('@leveloneproject/central-services-shared').Logger

class KmsConnection {
  constructor (settings) {
    this._url = settings.URL || 'ws://localhost:8080/sidecar'
  }

  connect () {
    return new P((resolve, reject) => {
      this._websocket = new WS(this._url, {
        perMessageDeflate: false
      })

      this._websocket.on('open', this._onOpen.bind(this))
      this._websocket.on('close', this._onClose.bind(this))
      this._websocket.on('message', this._onMessage.bind(this))
      this._websocket.on('error', this._onError.bind(this))

      resolve(this)
    })
  }

  register (sidecarId) {
    Logger.info(sidecarId)
  }

  _onOpen () {
    Logger.info('onOpen')
  }

  _onMessage (data, flags) {
    let parsedMessage = JSON.parse(data)
    Logger.info(`onMessage: ${parsedMessage}`)
  }

  _onError (err) {
    Logger.error(err)
  }

  _onClose (code, reason) {
    Logger.info(`onClose: ${code} - ${reason}`)
  }
}

exports.create = (settings) => {
  return new KmsConnection(settings || {})
}
