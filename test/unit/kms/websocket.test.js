'use strict'

const src = '../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const EventEmitter = require('events')
const Moment = require('moment')
const Logger = require('@leveloneproject/central-services-shared').Logger
const KeepAlive = require(`${src}/kms/keep-alive`)
const Proxyquire = require('proxyquire')

Test('WebSocket', webSocketTest => {
  let sandbox
  let clock
  let wsStub
  let keepAliveStub
  let WebSocket

  webSocketTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Logger)
    sandbox.stub(Moment, 'utc')
    sandbox.stub(KeepAlive, 'create')

    keepAliveStub = { start: sandbox.stub(), stop: sandbox.stub() }
    KeepAlive.create.returns(keepAliveStub)

    wsStub = sandbox.stub()
    WebSocket = Proxyquire(`${src}/kms/websocket`, { 'ws': wsStub })

    clock = sandbox.useFakeTimers()

    t.end()
  })

  webSocketTest.afterEach(t => {
    sandbox.restore()
    clock.restore()
    t.end()
  })

  webSocketTest.test('create should', createTest => {
    createTest.test('create new websocket and set properties', test => {
      let settings = { url: 'ws://test.com', pingInterval: 5000, connectTimeout: 9000, reconnectInterval: 2000 }
      let webSocket = WebSocket.create(settings)

      test.equal(webSocket._url, settings.url)
      test.equal(webSocket._pingInterval, settings.pingInterval)
      test.equal(webSocket._connectTimeout, settings.connectTimeout)
      test.equal(webSocket._reconnectInterval, settings.reconnectInterval)
      test.ok(KeepAlive.create.calledWith(settings.pingInterval))
      test.end()
    })

    createTest.end()
  })

  webSocketTest.test('connect should', connectTest => {
    connectTest.test('create websocket connection and emit open event', test => {
      let openSpy = sandbox.spy()

      let settings = { url: 'ws://test.com', pingInterval: 5000 }
      let webSocket = WebSocket.create(settings)
      webSocket.on('open', openSpy)

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      webSocket.connect()

      test.notOk(openSpy.calledOnce)
      test.ok(wsStub.calledWithNew())
      test.ok(wsStub.calledWith(settings.url, sandbox.match({
        perMessageDeflate: false
      })))
      test.notOk(webSocket._connected)
      test.ok(wsEmitter.listenerCount('open'), 1)
      test.ok(wsEmitter.listenerCount('error'), 1)
      test.equal(wsEmitter.listeners('error')[0].name.indexOf('_onError'), -1)

      wsEmitter.emit('open')

      test.ok(openSpy.calledOnce)
      test.ok(webSocket._connected)
      test.equal(wsEmitter.listenerCount('open'), 0)
      test.equal(wsEmitter.listenerCount('close'), 1)
      test.equal(wsEmitter.listenerCount('error'), 1)
      test.equal(wsEmitter.listenerCount('message'), 1)
      test.notEqual(wsEmitter.listeners('error')[0].name.indexOf('_onError'), -1)
      test.equal(wsEmitter.listenerCount('ping'), 1)
      test.equal(wsEmitter.listenerCount('pong'), 1)
      test.notOk(webSocket._connectTimerId)
      test.notOk(webSocket._reconnectTimerId)
      test.ok(keepAliveStub.start.calledWith(wsEmitter))
      test.end()
    })

    connectTest.test('reject if connect timeout reached', test => {
      let openSpy = sandbox.spy()
      let errorSpy = sandbox.spy()

      let settings = { url: 'ws://test.com', connectTimeout: 5000 }
      let webSocket = WebSocket.create(settings)
      webSocket.on('open', openSpy)
      webSocket.on('error', errorSpy)

      let wsEmitter = new EventEmitter()
      wsEmitter.close = sandbox.stub()
      wsStub.returns(wsEmitter)

      webSocket.connect()

      test.notOk(openSpy.calledOnce)
      test.ok(wsStub.calledWithNew())
      test.ok(wsStub.calledWith(settings.url, sandbox.match({
        perMessageDeflate: false
      })))
      test.notOk(webSocket._connected)
      test.ok(wsEmitter.listenerCount('open'), 1)
      test.ok(wsEmitter.listenerCount('error'), 1)
      test.equal(wsEmitter.listeners('error')[0].name.indexOf('_onError'), -1)

      clock.tick(settings.connectTimeout + 1)

      test.notOk(openSpy.calledOnce)
      test.notOk(webSocket._connected)
      test.ok(wsEmitter.close.calledOnce)
      test.equal(wsEmitter.listenerCount('open'), 0)
      test.equal(wsEmitter.listenerCount('close'), 0)
      test.equal(wsEmitter.listenerCount('error'), 0)
      test.equal(wsEmitter.listenerCount('message'), 0)
      test.notOk(webSocket._connectTimerId)
      test.notOk(webSocket._reconnectTimerId)
      test.notOk(keepAliveStub.start.calledOnce)
      test.ok(errorSpy.calledWith(sandbox.match({
        message: `Unable to connect to KMS within ${settings.connectTimeout}ms`
      })))
      test.end()
    })

    connectTest.test('reconnect if ECONNREFUSED error', test => {
      let openSpy = sandbox.spy()
      let errorSpy = sandbox.spy()

      let settings = { url: 'ws://test.com', connectTimeout: 5000, reconnectInterval: 1000, pingInterval: 5000 }
      let webSocket = WebSocket.create(settings)
      webSocket.on('open', openSpy)
      webSocket.on('error', errorSpy)

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      webSocket.connect()

      test.notOk(openSpy.calledOnce)
      test.ok(wsStub.calledWithNew())
      test.ok(wsStub.calledWith(settings.url, sandbox.match({
        perMessageDeflate: false
      })))
      test.notOk(webSocket._connected)
      test.ok(wsEmitter.listenerCount('open'), 1)
      test.ok(wsEmitter.listenerCount('error'), 1)
      test.equal(wsEmitter.listeners('error')[0].name.indexOf('_onError'), -1)

      let error = new Error('Error connecting to websocket')
      error.code = 'ECONNREFUSED'
      wsEmitter.emit('error', error)

      clock.tick(settings.reconnectInterval + 1)

      wsEmitter.emit('open')

      test.ok(openSpy.calledOnce)
      test.ok(webSocket._connected)
      test.equal(wsEmitter.listenerCount('open'), 0)
      test.equal(wsEmitter.listenerCount('close'), 1)
      test.equal(wsEmitter.listenerCount('error'), 1)
      test.equal(wsEmitter.listenerCount('message'), 1)
      test.notEqual(wsEmitter.listeners('error')[0].name.indexOf('_onError'), -1)
      test.equal(wsEmitter.listenerCount('ping'), 1)
      test.equal(wsEmitter.listenerCount('pong'), 1)
      test.notOk(webSocket._connectTimerId)
      test.notOk(webSocket._reconnectTimerId)
      test.ok(keepAliveStub.start.calledWith(wsEmitter))
      test.ok(Logger.info.calledWith(`Error connecting to KMS, attempting to connect after sleeping ${settings.reconnectInterval}ms`))
      test.end()
    })

    connectTest.test('reject if error event emitted', test => {
      let openSpy = sandbox.spy()
      let errorSpy = sandbox.spy()

      let settings = { url: 'ws://test.com' }
      let webSocket = WebSocket.create(settings)
      webSocket.on('open', openSpy)
      webSocket.on('error', errorSpy)

      let wsEmitter = new EventEmitter()
      wsEmitter.close = sandbox.stub()
      wsStub.returns(wsEmitter)

      webSocket.connect()

      test.notOk(openSpy.calledOnce)
      test.ok(wsStub.calledWithNew())
      test.ok(wsStub.calledWith(settings.url, sandbox.match({
        perMessageDeflate: false
      })))
      test.notOk(webSocket._connected)
      test.ok(wsEmitter.listenerCount('open'), 1)
      test.ok(wsEmitter.listenerCount('error'), 1)
      test.equal(wsEmitter.listeners('error')[0].name.indexOf('_onError'), -1)

      let error = new Error('Error connecting to websocket')
      wsEmitter.emit('error', error)

      test.notOk(openSpy.calledOnce)
      test.notOk(webSocket._connected)
      test.ok(wsEmitter.close.calledOnce)
      test.equal(wsEmitter.listenerCount('open'), 0)
      test.equal(wsEmitter.listenerCount('close'), 0)
      test.equal(wsEmitter.listenerCount('error'), 0)
      test.equal(wsEmitter.listenerCount('message'), 0)
      test.notOk(webSocket._connectTimerId)
      test.notOk(webSocket._reconnectTimerId)
      test.notOk(keepAliveStub.start.calledOnce)
      test.ok(errorSpy.calledWith(error))
      test.end()
    })

    connectTest.test('emit open event if already connected', test => {
      let openSpy = sandbox.spy()

      let ws = WebSocket.create({})
      ws._connected = true
      ws.on('open', openSpy)

      ws.connect()

      test.notOk(wsStub.calledOnce)
      test.ok(openSpy.calledOnce)
      test.end()
    })

    connectTest.end()
  })

  webSocketTest.test('send should', sendTest => {
    sendTest.test('call send method on internal ws if connected', test => {
      let webSocket = WebSocket.create({})

      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()
      wsStub.returns(wsEmitter)

      webSocket.connect()
      wsEmitter.emit('open')

      let msg = 'This is a test'
      webSocket.send(msg)

      test.ok(wsEmitter.send.calledWith(msg))

      test.end()
    })

    sendTest.test('do nothing if internal ws not connected', test => {
      let webSocket = WebSocket.create({})

      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()
      wsStub.returns(wsEmitter)

      webSocket.send('This is a test')

      test.notOk(wsEmitter.send.calledOnce)

      test.end()
    })

    sendTest.end()
  })

  webSocketTest.test('close should', closeTest => {
    closeTest.test('call close method on internal ws if connected', test => {
      let webSocket = WebSocket.create({})

      let wsEmitter = new EventEmitter()
      wsEmitter.close = sandbox.stub()
      wsStub.returns(wsEmitter)

      webSocket.connect()
      wsEmitter.emit('open')

      webSocket.close()

      test.ok(wsEmitter.close.calledWith())

      test.end()
    })

    closeTest.test('do nothing if internal websocket not connected', test => {
      let webSocket = WebSocket.create({})

      let wsEmitter = new EventEmitter()
      wsEmitter.close = sandbox.stub()
      wsStub.returns(wsEmitter)

      webSocket.close(1000, 'We are done')

      test.notOk(wsEmitter.close.calledOnce)

      test.end()
    })

    closeTest.end()
  })

  webSocketTest.test('receiving ws close event should', closeEventTest => {
    closeEventTest.test('cleanup and emit close event', test => {
      let closeSpy = sandbox.spy()

      let webSocket = WebSocket.create({})
      webSocket.on('close', closeSpy)

      let wsEmitter = new EventEmitter()
      wsEmitter.close = sandbox.stub()
      wsStub.returns(wsEmitter)

      webSocket.connect()
      wsEmitter.emit('open')

      let code = 100
      let reason = 'reason'
      wsEmitter.emit('close', code, reason)

      test.ok(keepAliveStub.stop.calledOnce)
      test.equal(wsEmitter.listenerCount(), 0)
      test.notOk(webSocket._ws)
      test.notOk(webSocket._connectTimerId)
      test.notOk(webSocket._reconnectTimerId)
      test.notOk(webSocket._connected)
      test.ok(wsEmitter.close.calledOnce)
      test.ok(closeSpy.calledWith(code, reason))
      test.end()
    })

    closeEventTest.end()
  })

  webSocketTest.test('receiving ws error event should', errorEventTest => {
    errorEventTest.test('cleanup and emit error event', test => {
      let errorSpy = sandbox.spy()

      let webSocket = WebSocket.create({})
      webSocket.on('error', errorSpy)

      let wsEmitter = new EventEmitter()
      wsEmitter.close = sandbox.stub()
      wsStub.returns(wsEmitter)

      webSocket.connect()
      wsEmitter.emit('open')

      let err = new Error()
      wsEmitter.emit('error', err)

      test.ok(keepAliveStub.stop.calledOnce)
      test.equal(wsEmitter.listenerCount(), 0)
      test.notOk(webSocket._ws)
      test.notOk(webSocket._connectTimerId)
      test.notOk(webSocket._reconnectTimerId)
      test.notOk(webSocket._connected)
      test.ok(wsEmitter.close.calledOnce)
      test.ok(errorSpy.calledWith(err))
      test.end()
    })

    errorEventTest.end()
  })

  webSocketTest.test('receiving ws ping event should', pingEventTest => {
    pingEventTest.test('send pong', test => {
      let webSocket = WebSocket.create({})

      let wsEmitter = new EventEmitter()
      wsEmitter.pong = sandbox.stub()
      wsStub.returns(wsEmitter)

      webSocket.connect()
      wsEmitter.emit('open')

      let data = JSON.stringify({ test: 'test' })
      wsEmitter.emit('ping', data)
      test.ok(wsEmitter.pong.calledWith(data))
      test.end()
    })

    pingEventTest.end()
  })

  webSocketTest.test('receiving ws pong event', pongEventTest => {
    pongEventTest.test('log elapsed time since ping', test => {
      let webSocket = WebSocket.create({})

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      webSocket.connect()
      wsEmitter.emit('open')

      let now = Moment()
      Moment.utc.returns(now)

      let timestamp = Moment(now).subtract(5, 'seconds')
      let data = JSON.stringify({ timestamp: timestamp.toISOString() })

      wsEmitter.emit('pong', data)
      test.ok(Logger.info.calledWith('Received pong, elapsed 5000ms'))
      test.end()
    })

    pongEventTest.end()
  })

  webSocketTest.test('receiving ws message event should', messageEventTest => {
    messageEventTest.test('emit message event', test => {
      let messageSpy = sandbox.spy()

      let webSocket = WebSocket.create({})
      webSocket.on('message', messageSpy)

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      webSocket.connect()
      wsEmitter.emit('open')

      let msg = 'This is a test'
      wsEmitter.emit('message', msg)

      test.ok(messageSpy.calledWith(msg))
      test.end()
    })

    messageEventTest.end()
  })

  webSocketTest.end()
})
