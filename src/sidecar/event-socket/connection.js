'use strict'

const EventEmitter = require('events')

class TcpConnection extends EventEmitter {
  constructor (socket) {
    super()

    let self = this
    self._socket = socket

    self._prefixSize = 4
    self._buffer = Buffer.alloc(0)

    self._socket.on('data', data => {
      self._buffer = appendToBuffer(self._buffer, data)

      while (self._buffer && (self._buffer.length > self._prefixSize)) {
        let msgLength = self._buffer.readUInt32BE(0)
        let msgLengthWithHeader = msgLength + self._prefixSize

        if (self._buffer.length >= msgLengthWithHeader) {
          self.emit('message', self._buffer.slice(self._prefixSize, msgLengthWithHeader), self)
          self._buffer = self._buffer.slice(msgLengthWithHeader)
        } else {
          break
        }
      }
    })
    self._socket.on('close', () => self.emit('close'))
    self._socket.on('error', (err) => self.emit('error', err))
  }
}

const appendToBuffer = (existing, data) => {
  return Buffer.concat([existing, data], existing.length + data.length)
}

exports.create = (socket) => {
  return new TcpConnection(socket)
}
