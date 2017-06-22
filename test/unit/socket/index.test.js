'use strict'

const src = '../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const Net = require('net')
const EventEmitter = require('events').EventEmitter
const Fixtures = require('../fixtures')
const SocketListener = require(`${src}/socket`)
const TcpConnection = require(`${src}/socket/connection`)

Test('SocketListener', socketListenerTest => {
  let sandbox

  socketListenerTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Net, 'createServer')
    sandbox.stub(TcpConnection, 'create')
    t.end()
  })

  socketListenerTest.afterEach(t => {
    sandbox.restore()
    t.end()
  })

  socketListenerTest.test('listen should', listenTest => {
    listenTest.test('call listen method on internal server and wait for listening event to resolve', test => {
      let port = 1111
      let hostname = 'localhost'

      let socket = new EventEmitter()
      socket.listen = sandbox.stub()

      Net.createServer.returns(socket)

      let eventSocket = SocketListener.create()
      test.notOk(eventSocket._bound)

      let listenPromise = eventSocket.listen(port, hostname)

      socket.emit('listening')

      listenPromise
        .then(() => {
          test.ok(eventSocket._bound)
          test.ok(socket.listen.calledOnce)
          test.ok(socket.listen.calledWith(port, hostname))
          test.end()
        })
    })

    listenTest.end()
  })

  socketListenerTest.test('close should', closeTest => {
    closeTest.test('call close method on internal socket and emit close event', test => {
      let socket = new EventEmitter()
      socket.close = sandbox.stub()
      socket.close.callsArg(0)

      Net.createServer.returns(socket)

      let closeSpy = sandbox.spy()

      let eventSocket = SocketListener.create()
      eventSocket._bound = true
      eventSocket.on('close', closeSpy)

      eventSocket.close()

      test.ok(closeSpy.called)
      test.ok(socket.close.calledOnce)
      test.notOk(eventSocket._bound)
      test.end()
    })

    closeTest.test('do nothing if internal server not bound', test => {
      let socket = new EventEmitter()
      socket.close = sandbox.stub()

      Net.createServer.returns(socket)

      let eventSocket = SocketListener.create()
      eventSocket._bound = false

      eventSocket.close()

      test.notOk(socket.close.called)
      test.notOk(eventSocket._bound)
      test.end()
    })

    closeTest.end()
  })

  socketListenerTest.test('receiving server close should', serverCloseTest => {
    serverCloseTest.test('call close method on internal server and emit close event', test => {
      let socket = new EventEmitter()
      socket.close = sandbox.stub()
      socket.close.callsArg(0)

      Net.createServer.returns(socket)

      let closeSpy = sandbox.spy()

      let eventSocket = SocketListener.create()
      eventSocket._bound = true
      eventSocket.on('close', closeSpy)

      socket.emit('close')

      test.ok(closeSpy.called)
      test.ok(socket.close.calledOnce)
      test.notOk(eventSocket._bound)
      test.end()
    })

    serverCloseTest.end()
  })

  socketListenerTest.test('receiving server error should', serverErrorTest => {
    serverErrorTest.test('emit error event with existing error object', test => {
      let socket = new EventEmitter()
      Net.createServer.returns(socket)

      let errorSpy = sandbox.spy()

      let error = new Error('bad stuff in server')

      let eventSocket = SocketListener.create()
      eventSocket.on('error', errorSpy)

      socket.emit('error', error)

      test.ok(errorSpy.called)
      test.ok(errorSpy.calledWith(error))
      test.end()
    })

    serverErrorTest.end()
  })

  socketListenerTest.test('receiving server connection should', serverConnectionTest => {
    serverConnectionTest.test('create TcpConnection and add to list', test => {
      let socket = new EventEmitter()
      Net.createServer.returns(socket)

      let conn = sandbox.stub()
      conn.remoteAddress = 'localhost'
      conn.remotePort = 1111

      let tcpConnection = new EventEmitter()
      TcpConnection.create.returns(tcpConnection)

      let eventSocket = SocketListener.create()
      test.equal(eventSocket._connections.length, 0)

      socket.emit('connection', conn)
      test.equal(eventSocket._connections.length, 1)

      test.ok(TcpConnection.create.calledOnce)
      test.ok(TcpConnection.create.calledWith(conn))
      test.end()
    })

    serverConnectionTest.end()
  })

  socketListenerTest.test('receiving TcpConnection message should', connMessageTest => {
    connMessageTest.test('convert message to utf8 string and emit message event', test => {
      let socket = new EventEmitter()
      Net.createServer.returns(socket)

      let conn = sandbox.stub()
      conn.remoteAddress = 'localhost'
      conn.remotePort = 1111

      let tcpConnection = new EventEmitter()
      TcpConnection.create.returns(tcpConnection)

      let messageSpy = sandbox.spy()

      let eventSocket = SocketListener.create()
      eventSocket.on('message', messageSpy)

      socket.emit('connection', conn)

      let message = JSON.stringify({ id: '1ab042bd-e098-4d96-ae8b-e07aefd04ca4', serviceName: 'service' })
      let receiveBuffer = Fixtures.writeMessageToBuffer(message)

      tcpConnection.emit('message', receiveBuffer)

      test.ok(messageSpy.called)
      test.ok(messageSpy.calledWith(message))
      test.end()
    })

    connMessageTest.end()
  })

  socketListenerTest.test('receiving TcpConnection end should', connCloseTest => {
    connCloseTest.test('remove connection from list and emit disconnect event', test => {
      let socket = new EventEmitter()
      Net.createServer.returns(socket)

      let conn = sandbox.stub()
      conn.remoteAddress = 'localhost'
      conn.remotePort = 1111

      let tcpConnection = new EventEmitter()
      TcpConnection.create.returns(tcpConnection)

      let disconnectSpy = sandbox.spy()

      let eventSocket = SocketListener.create()
      eventSocket.on('disconnect', disconnectSpy)

      socket.emit('connection', conn)
      test.equal(eventSocket._connections.length, 1)

      tcpConnection.emit('end')
      test.equal(eventSocket._connections.length, 0)

      test.ok(disconnectSpy.called)
      test.ok(disconnectSpy.calledWith(tcpConnection))
      test.end()
    })

    connCloseTest.end()
  })

  socketListenerTest.test('receiving TcpConnection error should', connErrorTest => {
    connErrorTest.test('emit error event', test => {
      let socket = new EventEmitter()
      Net.createServer.returns(socket)

      let conn = sandbox.stub()
      conn.remoteAddress = 'localhost'
      conn.remotePort = 1111

      let tcpConnection = new EventEmitter()
      TcpConnection.create.returns(tcpConnection)

      let errorSpy = sandbox.spy()
      let error = new Error('bad stuff in server')

      let eventSocket = SocketListener.create()
      eventSocket.on('error', errorSpy)

      socket.emit('connection', conn)

      tcpConnection.emit('error', error)

      test.ok(errorSpy.called)
      test.ok(errorSpy.calledWith(error))
      test.end()
    })

    connErrorTest.end()
  })

  socketListenerTest.end()
})