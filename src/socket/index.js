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
    self._connections = []

    self._server = Net.createServer()
    self._server.on('connection', socket => {
      let tcpConnection = TcpConnection.create(socket)
      self._connections.push(tcpConnection)

      tcpConnection.on('message', msg => self.emit('message', msg.toString('utf8')))
      tcpConnection.on('end', () => {
        self._connections.splice(self._connections.indexOf(tcpConnection), 1)
        self.emit('disconnect', tcpConnection)
      })
      tcpConnection.on('error', err => self.emit('error', err))
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
}

exports.create = () => {
  return new SocketListener()
}
