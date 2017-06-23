'use strict'

const Moment = require('moment')

class KeepAlive {
  constructor (websocket, pingInterval) {
    this._ws = websocket
    this._pingTimer = null
    this._pingInterval = pingInterval
  }

  start () {
    if (!this._pingTimer) {
      this._pingTimer = setInterval(this._ping.bind(this), this._pingInterval)
    }
  }

  stop () {
    if (this._pingTimer) {
      clearInterval(this._pingTimer)
      this._pingTimer = null
    }
  }

  _ping () {
    this._ws.ping(JSON.stringify({ timestamp: Moment.utc().toISOString() }))
  }
}

exports.create = (websocket, pingInterval) => {
  return new KeepAlive(websocket, pingInterval)
}
