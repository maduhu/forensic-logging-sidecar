'use strict'

const src = '../../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const Net = require('net')
const EventEmitter = require('events').EventEmitter
const Fixtures = require('../../fixtures')
const EventSocket = require(`${src}/sidecar/event-socket`)
const TcpConnection = require(`${src}/sidecar/event-socket/connection`)

Test('EventSocket', eventSocketTest => {
  let sandbox

  eventSocketTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Net, 'createServer')
    sandbox.stub(TcpConnection, 'create')
    t.end()
  })

  eventSocketTest.afterEach(t => {
    sandbox.restore()
    t.end()
  })

  eventSocketTest.test('listen should', listenTest => {
    listenTest.test('call listen method on internal server and wait for event to resolve', test => {
      let port = 1111
      let hostname = 'localhost'

      let socket = new EventEmitter()
      socket.listen = sandbox.stub()

      Net.createServer.returns(socket)

      let eventSocket = EventSocket.create()
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

  eventSocketTest.test('close should', closeTest => {
    closeTest.test('call close method on internal socket and emit close event', test => {
      let socket = new EventEmitter()
      socket.close = sandbox.stub()
      socket.close.callsArg(0)

      Net.createServer.returns(socket)

      let closeSpy = sandbox.spy()

      let eventSocket = EventSocket.create()
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

      let eventSocket = EventSocket.create()
      eventSocket._bound = false

      eventSocket.close()

      test.notOk(socket.close.called)
      test.notOk(eventSocket._bound)
      test.end()
    })

    closeTest.end()
  })

  eventSocketTest.test('receiving server close should', serverCloseTest => {
    serverCloseTest.test('call close method on internal server and emit close event', test => {
      let socket = new EventEmitter()
      socket.close = sandbox.stub()
      socket.close.callsArg(0)

      Net.createServer.returns(socket)

      let closeSpy = sandbox.spy()

      let eventSocket = EventSocket.create()
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

  eventSocketTest.test('receiving server error should', serverErrorTest => {
    serverErrorTest.test('emit error event with existing error object', test => {
      let socket = new EventEmitter()
      Net.createServer.returns(socket)

      let errorSpy = sandbox.spy()

      let error = new Error('bad stuff in server')

      let eventSocket = EventSocket.create()
      eventSocket.on('error', errorSpy)

      socket.emit('error', error)

      test.ok(errorSpy.called)
      test.ok(errorSpy.calledWith(error))
      test.end()
    })

    serverErrorTest.end()
  })

  eventSocketTest.test('receiving server connection should', serverConnectionTest => {
    serverConnectionTest.test('create TcpConnection', test => {
      let socket = new EventEmitter()
      Net.createServer.returns(socket)

      let conn = sandbox.stub()
      conn.remoteAddress = 'localhost'
      conn.remotePort = 1111

      let tcpConnection = new EventEmitter()
      TcpConnection.create.returns(tcpConnection)

      EventSocket.create()

      socket.emit('connection', conn)

      test.ok(TcpConnection.create.calledOnce)
      test.ok(TcpConnection.create.calledWith(conn))
      test.end()
    })

    serverConnectionTest.end()
  })

  eventSocketTest.test('receiving TcpConnection message should', connMessageTest => {
    connMessageTest.test('emit message event', test => {
      let socket = new EventEmitter()
      Net.createServer.returns(socket)

      let conn = sandbox.stub()
      conn.remoteAddress = 'localhost'
      conn.remotePort = 1111

      let tcpConnection = new EventEmitter()
      TcpConnection.create.returns(tcpConnection)

      let messageSpy = sandbox.spy()

      let eventSocket = EventSocket.create()
      eventSocket.on('message', messageSpy)

      socket.emit('connection', conn)

      let message = JSON.stringify({ id: '1ab042bd-e098-4d96-ae8b-e07aefd04ca4', serviceName: 'service' })
      let receiveBuffer = Fixtures.writeMessageToBuffer(message)

      tcpConnection.emit('message', receiveBuffer)

      test.ok(messageSpy.called)
      test.ok(messageSpy.calledWith(receiveBuffer))
      test.end()
    })

    connMessageTest.end()
  })

  eventSocketTest.test('receiving TcpConnection close should', connCloseTest => {
    connCloseTest.test('emit disconnect event', test => {
      let socket = new EventEmitter()
      Net.createServer.returns(socket)

      let conn = sandbox.stub()
      conn.remoteAddress = 'localhost'
      conn.remotePort = 1111

      let tcpConnection = new EventEmitter()
      TcpConnection.create.returns(tcpConnection)

      let disconnectSpy = sandbox.spy()

      let eventSocket = EventSocket.create()
      eventSocket.on('disconnect', disconnectSpy)

      socket.emit('connection', conn)

      tcpConnection.emit('close')

      test.ok(disconnectSpy.called)
      test.ok(disconnectSpy.calledWith(tcpConnection))
      test.end()
    })

    connCloseTest.end()
  })

  eventSocketTest.test('receiving TcpConnection error should', connErrorTest => {
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

      let eventSocket = EventSocket.create()
      eventSocket.on('error', errorSpy)

      socket.emit('connection', conn)

      tcpConnection.emit('error', error)

      test.ok(errorSpy.called)
      test.ok(errorSpy.calledWith(error))
      test.end()
    })

    connErrorTest.end()
  })

  eventSocketTest.end()
})
