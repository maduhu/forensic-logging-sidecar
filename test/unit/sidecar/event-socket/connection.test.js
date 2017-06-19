'use strict'

const src = '../../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const EventEmitter = require('events')
const Fixtures = require('../../fixtures')
const TcpConnection = require(`${src}/sidecar/event-socket/connection`)

Test('TcpConnection', tcpConnTest => {
  let sandbox

  tcpConnTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    t.end()
  })

  tcpConnTest.afterEach(t => {
    sandbox.restore()
    t.end()
  })

  tcpConnTest.test('receiving socket close should', receiveCloseTest => {
    receiveCloseTest.test('emit close event', test => {
      let socket = new EventEmitter()
      let closeSpy = sandbox.spy()

      let conn = TcpConnection.create(socket)
      conn.on('close', closeSpy)

      socket.emit('close')

      test.ok(closeSpy.called)
      test.end()
    })

    receiveCloseTest.end()
  })

  tcpConnTest.test('receving socket error should', receiveErrorTest => {
    receiveErrorTest.test('emit error event with existing error object', test => {
      let socket = new EventEmitter()
      let errorSpy = sandbox.spy()

      let socketErr = new Error('this is bad')

      let conn = TcpConnection.create(socket)
      conn.on('error', errorSpy)

      socket.emit('error', socketErr)

      test.ok(errorSpy.called)
      test.ok(errorSpy.calledWith(socketErr))
      test.end()
    })

    receiveErrorTest.end()
  })

  tcpConnTest.test('receiving socket data should', receiveDataTest => {
    receiveDataTest.test('handle request and emit message event', test => {
      let socket = new EventEmitter()
      let messageSpy = sandbox.spy()

      let message = JSON.stringify({ id: 1, name: 'test' })
      let sendBuffer = Fixtures.writeMessageToBufferWithLength(message)
      let receiveBuffer = Fixtures.writeMessageToBuffer(message)

      let conn = TcpConnection.create(socket)
      conn.on('message', messageSpy)

      socket.emit('data', sendBuffer)

      test.ok(messageSpy.called)
      test.ok(messageSpy.calledWith(receiveBuffer))
      test.end()
    })

    receiveDataTest.test('handle multiple requests sent sequentially', test => {
      let socket = new EventEmitter()
      let messageSpy = sandbox.spy()
      let receiveBuffers = []

      let message = JSON.stringify({ id: 1, name: 'test' })
      let sendBuffer = Fixtures.writeMessageToBufferWithLength(message)
      receiveBuffers.push(Fixtures.writeMessageToBuffer(message))

      let message2 = JSON.stringify({ row: 5, key: 'key', value: 'val' })
      let sendBuffer2 = Fixtures.writeMessageToBufferWithLength(message2)
      receiveBuffers.push(Fixtures.writeMessageToBuffer(message2))

      let message3 = JSON.stringify({ id: '1ab042bd-e098-4d96-ae8b-e07aefd04ca4', serviceName: 'service' })
      let sendBuffer3 = Fixtures.writeMessageToBufferWithLength(message3)
      receiveBuffers.push(Fixtures.writeMessageToBuffer(message3))

      let conn = TcpConnection.create(socket)
      conn.on('message', messageSpy)

      socket.emit('data', sendBuffer)
      socket.emit('data', sendBuffer2)
      socket.emit('data', sendBuffer3)

      test.equal(messageSpy.callCount, receiveBuffers.length)
      receiveBuffers.forEach((b) => {
        test.ok(messageSpy.calledWith(b))
      })
      test.end()
    })

    receiveDataTest.test('handle message split over multiple data events', test => {
      let socket = new EventEmitter()
      let messageSpy = sandbox.spy()

      let message = JSON.stringify({ id: '1ab042bd-e098-4d96-ae8b-e07aefd04ca4', serviceName: 'service' })
      let sendBuffer = Fixtures.writeMessageToBufferWithLength(message)
      let receiveBuffer = Fixtures.writeMessageToBuffer(message)

      let partialBuffer1 = sendBuffer.slice(0, 5)
      let partialBuffer2 = sendBuffer.slice(5)

      let conn = TcpConnection.create(socket)
      conn.on('message', messageSpy)

      socket.emit('data', partialBuffer1)
      socket.emit('data', partialBuffer2)

      test.ok(messageSpy.called)
      test.ok(messageSpy.calledWith(receiveBuffer))
      test.end()
    })

    receiveDataTest.test('handle multiple messages split over multiple data events', test => {
      let socket = new EventEmitter()
      let messageSpy = sandbox.spy()
      let receiveBuffers = []

      let message = JSON.stringify({ id: '1ab042bd-e098-4d96-ae8b-e07aefd04ca4', serviceName: 'service' })
      let sendBuffer = Fixtures.writeMessageToBufferWithLength(message)
      receiveBuffers.push(Fixtures.writeMessageToBuffer(message))

      let message2 = JSON.stringify({ row: 5, key: 'key', value: 'val' })
      let sendBuffer2 = Fixtures.writeMessageToBufferWithLength(message2)
      receiveBuffers.push(Fixtures.writeMessageToBuffer(message2))

      // Append the beginning of the second buffer to the first buffer.
      let partialBuffer1 = Fixtures.appendToBuffer(sendBuffer, sendBuffer2.slice(0, 5))
      let partialBuffer2 = sendBuffer2.slice(5)

      let conn = TcpConnection.create(socket)
      conn.on('message', messageSpy)

      socket.emit('data', partialBuffer1)
      socket.emit('data', partialBuffer2)

      test.equal(messageSpy.callCount, receiveBuffers.length)
      receiveBuffers.forEach((b) => {
        test.ok(messageSpy.calledWith(b))
      })
      test.end()
    })

    receiveDataTest.test('handle multiple messages in one data event', test => {
      let socket = new EventEmitter()
      let messageSpy = sandbox.spy()
      let receiveBuffers = []

      let message = JSON.stringify({ id: '1ab042bd-e098-4d96-ae8b-e07aefd04ca4', serviceName: 'service' })
      let sendBuffer = Fixtures.writeMessageToBufferWithLength(message)
      receiveBuffers.push(Fixtures.writeMessageToBuffer(message))

      let message2 = JSON.stringify({ row: 5, key: 'key', value: 'val' })
      let sendBuffer2 = Fixtures.writeMessageToBufferWithLength(message2)
      receiveBuffers.push(Fixtures.writeMessageToBuffer(message2))

      let combinedBuffer = Fixtures.appendToBuffer(sendBuffer, sendBuffer2)

      let conn = TcpConnection.create(socket)
      conn.on('message', messageSpy)

      socket.emit('data', combinedBuffer)

      test.equal(messageSpy.callCount, receiveBuffers.length)
      receiveBuffers.forEach((b) => {
        test.ok(messageSpy.calledWith(b))
      })
      test.end()
    })

    receiveDataTest.test('not emit message event if sent data with no prefix header', test => {
      let socket = new EventEmitter()
      let messageSpy = sandbox.spy()

      let sendBuffer = Buffer.from('junk data')

      let conn = TcpConnection.create(socket)
      conn.on('message', messageSpy)

      socket.emit('data', sendBuffer)

      test.notOk(messageSpy.called)
      test.end()
    })

    receiveDataTest.end()
  })

  tcpConnTest.end()
})
