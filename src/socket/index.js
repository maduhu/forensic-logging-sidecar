'use strict'

const P = require('bluebird')
const Net = require('net')
const EventEmitter = require('events')
const TcpConnection = require('./connection')

class SocketListener extends EventEmitter {
  constructor () {
    super()

    let self = this
    self._bound = false
    self._paused = false
    self._connections = []
    self._queuedMessages = []

    self._server = Net.createServer()
    self._server.on('connection', socket => {
      let tcpConnection = TcpConnection.create(socket)
      self._connections.push(tcpConnection)

      tcpConnection.on('message', self._onConnectionMessage.bind(self))
      tcpConnection.on('end', () => self._disconnectConnection(tcpConnection))
      tcpConnection.on('error', e => self._disconnectConnection(tcpConnection))
    })
    self._server.on('close', () => self.close())
    self._server.on('error', err => self.emit('error', err))
  }

  close () {
    if (this._bound) {
      this._bound = false
      this._server.close(() => this.emit('close'))
    }
  }

  listen (port, address) {
    return new P((resolve, reject) => {
      this._server.once('listening', () => {
        this._bound = true
        resolve()
      })

      this._server.listen(port, address)
    })
  }

  pause () {
    this._paused = true
    return P.resolve()
  }

  restart () {
    if (this._paused) {
      return new P((resolve, reject) => {
        this._paused = false
        this._queuedMessages.forEach(m => {
          this.emit('message', m)
        })
        this._queuedMessages.length = 0

        resolve()
      })
    }
  }

  _disconnectConnection (tcpConnection) {
    this._connections.splice(this._connections.indexOf(tcpConnection), 1)
    this.emit('disconnect', tcpConnection)
  }

  _onConnectionMessage (msg) {
    let message = msg.toString('utf8')
    if (this._paused) {
      this._queuedMessages.push(message)
    } else {
      this.emit('message', message)
    }
  }
}

exports.create = () => {
  return new SocketListener()
}
