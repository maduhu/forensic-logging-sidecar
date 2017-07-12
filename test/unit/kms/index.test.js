'use strict'

const src = '../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const EventEmitter = require('events')
const Moment = require('moment')
const Logger = require('@leveloneproject/central-services-shared').Logger
const KeepAlive = require(`${src}/kms/keep-alive`)
const Errors = require(`${src}/errors`)
const SymmetricCrypto = require(`${src}/crypto/symmetric`)
const AsymmetricCrypto = require(`${src}/crypto/asymmetric`)
const Proxyquire = require('proxyquire')

Test('KmsConnection', kmsConnTest => {
  let sandbox
  let wsStub
  let keepAliveStub
  let KmsConnection

  kmsConnTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Logger)
    sandbox.stub(Moment, 'utc')
    sandbox.stub(KeepAlive, 'create')
    sandbox.stub(SymmetricCrypto, 'sign')
    sandbox.stub(AsymmetricCrypto, 'sign')

    keepAliveStub = { start: sandbox.stub(), stop: sandbox.stub() }
    KeepAlive.create.returns(keepAliveStub)

    wsStub = sandbox.stub()
    KmsConnection = Proxyquire(`${src}/kms`, { 'ws': wsStub })

    t.end()
  })

  kmsConnTest.afterEach(t => {
    sandbox.restore()
    t.end()
  })

  kmsConnTest.test('create should', createTest => {
    createTest.test('create new connection and set properties', test => {
      let settings = { url: 'ws://test.com', pingInterval: 5000 }
      let conn = KmsConnection.create(settings)

      test.equal(conn._url, settings.url)
      test.equal(conn._pingInterval, settings.pingInterval)
      test.end()
    })

    createTest.test('use default property values', test => {
      let conn = KmsConnection.create()

      test.equal(conn._url, 'ws://localhost:8080/sidecar')
      test.equal(conn._pingInterval, 30000)
      test.end()
    })

    createTest.end()
  })

  kmsConnTest.test('connect should', connectTest => {
    connectTest.test('create websocket connection and resolve when open', test => {
      let settings = { url: 'ws://test.com', pingInterval: 5000 }
      let kmsConnection = KmsConnection.create(settings)

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      wsEmitter.emit('open')

      let connectPromise = kmsConnection.connect()
      test.ok(wsStub.calledWithNew())
      test.ok(wsStub.calledWith(settings.url, sandbox.match({
        perMessageDeflate: false
      })))
      test.notOk(kmsConnection._connected)
      test.ok(wsEmitter.listenerCount('open'), 1)
      test.ok(wsEmitter.listenerCount('error'), 1)
      test.equal(wsEmitter.listeners('error')[0].name.indexOf('_wsOnError'), -1)

      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          test.ok(kmsConnection._connected)
          test.equal(wsEmitter.listenerCount('open'), 0)
          test.equal(wsEmitter.listenerCount('close'), 1)
          test.equal(wsEmitter.listenerCount('error'), 1)
          test.notEqual(wsEmitter.listeners('error')[0].name.indexOf('_wsOnError'), -1)
          test.equal(wsEmitter.listenerCount('ping'), 1)
          test.equal(wsEmitter.listenerCount('pong'), 1)
          test.equal(wsEmitter.listenerCount('message'), 0)
          test.ok(KeepAlive.create.calledWith(wsEmitter, settings.pingInterval))
          test.ok(keepAliveStub.start.calledOnce)
          test.end()
        })
    })

    connectTest.test('reject if error event emitted', test => {
      let settings = { url: 'ws://test.com' }
      let kmsConnection = KmsConnection.create(settings)

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      wsEmitter.emit('open')

      let connectPromise = kmsConnection.connect()
      test.ok(wsStub.calledWithNew())
      test.ok(wsStub.calledWith(settings.url, sandbox.match({
        perMessageDeflate: false
      })))
      test.notOk(kmsConnection._connected)
      test.ok(wsEmitter.listenerCount('open'), 1)
      test.ok(wsEmitter.listenerCount('error'), 1)
      test.equal(wsEmitter.listeners('error')[0].name.indexOf('_onError'), -1)

      let error = new Error('Error connecting to websocket')
      wsEmitter.emit('error', error)

      connectPromise
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(err => {
          test.notOk(kmsConnection._connected)
          test.equal(wsEmitter.listenerCount('open'), 0)
          test.equal(wsEmitter.listenerCount('close'), 0)
          test.equal(wsEmitter.listenerCount('error'), 0)
          test.equal(wsEmitter.listenerCount('message'), 0)
          test.notOk(KeepAlive.create.calledOnce)
          test.equal(err, error)
          test.end()
        })
    })

    connectTest.test('return immediately if already connected', test => {
      let kmsConnection = KmsConnection.create()
      kmsConnection._connected = true

      kmsConnection.connect()
        .then(() => {
          test.notOk(wsStub.calledOnce)
          test.end()
        })
    })

    connectTest.end()
  })

  kmsConnTest.test('register should', registerTest => {
    registerTest.test('reject if not connected', test => {
      let conn = KmsConnection.create()

      conn.register('id')
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(err => {
          test.equal(err.message, 'You must connect before registering')
          test.end()
        })
    })

    registerTest.test('register with KMS and perform challenge', test => {
      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()

      let conn = KmsConnection.create()
      conn._connected = true
      conn._ws = wsEmitter

      let sidecarId = 'sidecar1'
      let serviceName = 'TestSidecar'

      let registerMessageId = `register-${sidecarId}`
      let registerRequest = { jsonrpc: '2.0', id: registerMessageId, method: 'register', params: { id: sidecarId, serviceName } }
      let registerResponse = { jsonrpc: '2.0', id: registerMessageId, result: { id: sidecarId, batchKey: 'batch-key', rowKey: 'row-key', challenge: 'challenge' } }

      const rowSignature = 'row-signature'
      const batchSignature = 'batch-signature'
      SymmetricCrypto.sign.returns(rowSignature)
      AsymmetricCrypto.sign.returns(batchSignature)

      let challengeMessageId = `challenge-${sidecarId}`
      let challengeRequest = { jsonrpc: '2.0', id: challengeMessageId, method: 'challenge', params: { rowSignature, batchSignature } }
      let challengeResponse = { jsonrpc: '2.0', id: challengeMessageId, result: { status: 'ok' } }

      let registerPromise = conn.register(sidecarId, serviceName)

      wsEmitter.emit('message', JSON.stringify(registerResponse))
      wsEmitter.emit('message', JSON.stringify(challengeResponse))

      registerPromise
        .then(keys => {
          test.ok(Logger.info.calledWith('Received initial KMS registration response'))

          test.ok(wsEmitter.send.calledTwice)
          test.deepEqual(JSON.parse(wsEmitter.send.firstCall.args), registerRequest)
          test.deepEqual(JSON.parse(wsEmitter.send.secondCall.args), challengeRequest)

          test.ok(SymmetricCrypto.sign.calledWith(registerResponse.result.challenge, registerResponse.result.rowKey))
          test.ok(AsymmetricCrypto.sign.calledWith(registerResponse.result.challenge, registerResponse.result.batchKey))

          test.equal(keys.batchKey, registerResponse.result.batchKey)
          test.equal(keys.rowKey, registerResponse.result.rowKey)
          test.end()
        })
    })

    registerTest.test('throw error if a non-register message received', test => {
      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()

      let conn = KmsConnection.create()
      conn._connected = true
      conn._ws = wsEmitter

      let sidecarId = 'sidecar1'
      let registerResponse = { jsonrpc: '2.0', id: 'non-register', result: { id: sidecarId, batchKey: 'batchKey', rowKey: 'rowKey' } }

      let registerPromise = conn.register(sidecarId)

      wsEmitter.emit('message', JSON.stringify(registerResponse))

      registerPromise
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(Errors.KmsRegistrationError, err => {
          test.ok(wsEmitter.send.calledOnce)
          test.equal(err.message, `Received non-register message from KMS during registration: ${JSON.stringify(registerResponse)}`)
          test.end()
        })
    })

    registerTest.test('throw error if KMS sends error during registration', test => {
      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()

      let conn = KmsConnection.create()
      conn._connected = true
      conn._ws = wsEmitter

      let sidecarId = 'sidecar1'
      let registerResponse = { jsonrpc: '2.0', id: `register-${sidecarId}`, error: { id: 101, message: 'bad stuff' } }

      let registerPromise = conn.register(sidecarId)

      wsEmitter.emit('message', JSON.stringify(registerResponse))

      registerPromise
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(Errors.KmsRegistrationError, err => {
          test.ok(wsEmitter.send.calledOnce)
          test.equal(err.message, `Error received during KMS registration: ${registerResponse.error.id} - ${registerResponse.error.message}`)
          test.end()
        })
    })

    registerTest.test('throw error if a non-challenge message received', test => {
      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()

      let conn = KmsConnection.create()
      conn._connected = true
      conn._ws = wsEmitter

      let sidecarId = 'sidecar1'

      let registerResponse = { jsonrpc: '2.0', id: `register-${sidecarId}`, result: { id: sidecarId, batchKey: 'batch-key', rowKey: 'row-key', challenge: 'challenge' } }
      let challengeResponse = { jsonrpc: '2.0', id: 'non-challenge', result: { status: 'ok' } }

      let registerPromise = conn.register(sidecarId)

      wsEmitter.emit('message', JSON.stringify(registerResponse))
      wsEmitter.emit('message', JSON.stringify(challengeResponse))

      registerPromise
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(Errors.KmsRegistrationError, err => {
          test.ok(wsEmitter.send.calledTwice)
          test.equal(err.message, `Received non-challenge message from KMS during challenge: ${JSON.stringify(challengeResponse)}`)
          test.end()
        })
    })

    registerTest.test('throw error if KMS sends error during challenge', test => {
      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()

      let conn = KmsConnection.create()
      conn._connected = true
      conn._ws = wsEmitter

      let sidecarId = 'sidecar1'

      let registerResponse = { jsonrpc: '2.0', id: `register-${sidecarId}`, result: { id: sidecarId, batchKey: 'batch-key', rowKey: 'row-key', challenge: 'challenge' } }
      let challengeResponse = { jsonrpc: '2.0', id: `challenge-${sidecarId}`, error: { id: 105, message: 'bad challenge' } }

      let registerPromise = conn.register(sidecarId)

      wsEmitter.emit('message', JSON.stringify(registerResponse))
      wsEmitter.emit('message', JSON.stringify(challengeResponse))

      registerPromise
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(Errors.KmsRegistrationError, err => {
          test.equal(err.message, `Error received during KMS challenge: ${challengeResponse.error.id} - ${challengeResponse.error.message}`)
          test.end()
        })
    })

    registerTest.test('throw error if KMS returns invalid status during challenge', test => {
      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()

      let conn = KmsConnection.create()
      conn._connected = true
      conn._ws = wsEmitter

      let sidecarId = 'sidecar1'

      let registerResponse = { jsonrpc: '2.0', id: `register-${sidecarId}`, result: { id: sidecarId, batchKey: 'batch-key', rowKey: 'row-key', challenge: 'challenge' } }
      let challengeResponse = { jsonrpc: '2.0', id: `challenge-${sidecarId}`, result: { status: 'nope' } }

      let registerPromise = conn.register(sidecarId)

      wsEmitter.emit('message', JSON.stringify(registerResponse))
      wsEmitter.emit('message', JSON.stringify(challengeResponse))

      registerPromise
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(Errors.KmsRegistrationError, err => {
          test.equal(err.message, `Received invalid status from KMS during challenge: ${challengeResponse.result.status}`)
          test.end()
        })
    })

    registerTest.test('switch message handling back to default handler after done registering', test => {
      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()

      let conn = KmsConnection.create()
      conn._connected = true
      conn._ws = wsEmitter

      let sidecarId = 'sidecar1'
      let registerResponse = { jsonrpc: '2.0', id: `register-${sidecarId}`, result: { id: sidecarId, batchKey: 'batchKey', rowKey: 'rowKey' } }
      let challengeResponse = { jsonrpc: '2.0', id: `challenge-${sidecarId}`, result: { status: 'ok' } }

      let registerPromise = conn.register(sidecarId)

      wsEmitter.emit('message', JSON.stringify(registerResponse))
      wsEmitter.emit('message', JSON.stringify(challengeResponse))

      registerPromise
        .then(keys => {
          test.ok(Logger.info.calledWith('Received initial KMS registration response'))
          test.ok(Logger.info.calledWith('Received KMS registration challenge response'))
          test.equal(Logger.info.callCount, 2)

          let messageData2 = JSON.stringify({ method: 'test' })
          wsEmitter.emit('message', messageData2)

          test.equal(Logger.info.callCount, 2)

          test.end()
        })
    })

    registerTest.end()
  })

  kmsConnTest.test('sendRequest should', sendRequestTest => {
    sendRequestTest.test('build JsonRPC request and send through websocket', test => {
      let id = 'id'
      let method = 'test'
      let params = { key: 'val' }
      let jsonRpcRequest = { jsonrpc: '2.0', id, method, params }

      let ws = { send: sandbox.stub() }

      let conn = KmsConnection.create()
      conn._ws = ws

      conn.sendRequest(id, method, params)
      test.ok(ws.send.calledOnce)
      test.deepEqual(JSON.parse(ws.send.firstCall.args), jsonRpcRequest)

      test.end()
    })

    sendRequestTest.end()
  })

  kmsConnTest.test('sendResponse should', sendResponseTest => {
    sendResponseTest.test('build JsonRPC response and send through websocket', test => {
      let id = 'id'
      let result = { key: 'val' }
      let jsonRpcResponse = { jsonrpc: '2.0', id, result }

      let ws = { send: sandbox.stub() }

      let conn = KmsConnection.create()
      conn._ws = ws

      conn.sendResponse(id, result)
      test.ok(ws.send.calledOnce)
      test.deepEqual(JSON.parse(ws.send.firstCall.args), jsonRpcResponse)
      test.end()
    })

    sendResponseTest.end()
  })

  kmsConnTest.test('sendErrorResponse should', sendErrorResponseTest => {
    sendErrorResponseTest.test('build JsonRPC error response and send through websocket', test => {
      let id = 'id'
      let error = { id: 101, message: 'error happened' }
      let jsonRpcErrorResponse = { jsonrpc: '2.0', id, error }

      let ws = { send: sandbox.stub() }

      let conn = KmsConnection.create()
      conn._ws = ws

      conn.sendErrorResponse(id, error)
      test.ok(ws.send.calledOnce)
      test.deepEqual(JSON.parse(ws.send.firstCall.args), jsonRpcErrorResponse)
      test.end()
    })

    sendErrorResponseTest.end()
  })

  kmsConnTest.test('receiving websocket close event should', closeEventTest => {
    closeEventTest.test('log close details and cleanup', test => {
      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let code = 100
          let reason = 'reason'
          wsEmitter.emit('close', code, reason)
          test.ok(Logger.info.calledWith(`KMS websocket connection closed: ${code} - ${reason}`))
          test.ok(keepAliveStub.stop.calledOnce)
          test.end()
        })
    })

    closeEventTest.end()
  })

  kmsConnTest.test('receiving websocket error event should', errorEventTest => {
    errorEventTest.test('log error and cleanup', test => {
      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let err = new Error()
          wsEmitter.emit('error', err)
          test.ok(Logger.error.calledWith('Error on KMS websocket connection', err))
          test.ok(keepAliveStub.stop.calledOnce)
          test.end()
        })
    })

    errorEventTest.end()
  })

  kmsConnTest.test('receiving websocket ping event should', pingEventTest => {
    pingEventTest.test('send pong', test => {
      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsEmitter.pong = sandbox.stub()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let data = JSON.stringify({ test: 'test' })
          wsEmitter.emit('ping', data)
          test.ok(wsEmitter.pong.calledWith(data))
          test.end()
        })
    })

    pingEventTest.end()
  })

  kmsConnTest.test('receiving websocket pong event', pongEventTest => {
    pongEventTest.test('log elapsed time since ping', test => {
      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let now = Moment()
          Moment.utc.returns(now)

          let timestamp = Moment(now).subtract(5, 'seconds')
          let data = JSON.stringify({ timestamp: timestamp.toISOString() })

          wsEmitter.emit('pong', data)
          test.ok(Logger.info.calledWith('Received pong, elapsed 5000ms'))
          test.end()
        })
    })

    pongEventTest.end()
  })

  kmsConnTest.test('receiving websocket message event should', messageEventTest => {
    messageEventTest.test('check for healtcheck method and emit healthCheck event', test => {
      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()

      let healthCheckSpy = sandbox.spy()

      let conn = KmsConnection.create()
      conn.on('healthCheck', healthCheckSpy)
      conn._connected = true
      conn._ws = wsEmitter

      let sidecarId = 'sidecar1'
      let registerResponse = { jsonrpc: '2.0', id: `register-${sidecarId}`, result: { id: sidecarId, batchKey: 'batchKey', rowKey: 'rowKey' } }
      let challengeResponse = { jsonrpc: '2.0', id: `challenge-${sidecarId}`, result: { status: 'ok' } }

      let registerPromise = conn.register(sidecarId)

      wsEmitter.emit('message', JSON.stringify(registerResponse))
      wsEmitter.emit('message', JSON.stringify(challengeResponse))

      registerPromise
        .then(keys => {
          let healthCheck = { jsonrpc: '2.0', id: 'e1c609bd-e147-460b-ae61-98264bc935ad', method: 'healthcheck', params: { level: 'ping' } }
          wsEmitter.emit('message', JSON.stringify(healthCheck))

          test.ok(healthCheckSpy.calledWith(sandbox.match({
            id: healthCheck.id,
            level: healthCheck.params.level
          })))

          test.end()
        })
    })

    messageEventTest.end()
  })

  kmsConnTest.end()
})
