'use strict'

const src = '../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const P = require('bluebird')
const EventEmitter = require('events')
const Moment = require('moment')
const Logger = require('@leveloneproject/central-services-shared').Logger
const Requests = require(`${src}/kms/requests`)
const KeepAlive = require(`${src}/kms/keep-alive`)
const Errors = require(`${src}/errors`)
const SymmetricCrypto = require(`${src}/crypto/symmetric`)
const AsymmetricCrypto = require(`${src}/crypto/asymmetric`)
const Proxyquire = require('proxyquire')

Test('KmsConnection', kmsConnTest => {
  let sandbox
  let wsStub
  let uuidStub
  let keepAliveStub
  let KmsConnection

  kmsConnTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Logger)
    sandbox.stub(Moment, 'utc')
    sandbox.stub(Requests, 'create')
    sandbox.stub(KeepAlive, 'create')
    sandbox.stub(SymmetricCrypto, 'sign')
    sandbox.stub(AsymmetricCrypto, 'sign')

    keepAliveStub = { start: sandbox.stub(), stop: sandbox.stub() }
    KeepAlive.create.returns(keepAliveStub)

    wsStub = sandbox.stub()
    uuidStub = sandbox.stub()
    KmsConnection = Proxyquire(`${src}/kms`, { 'ws': wsStub, 'uuid4': uuidStub })

    t.end()
  })

  kmsConnTest.afterEach(t => {
    sandbox.restore()
    t.end()
  })

  kmsConnTest.test('create should', createTest => {
    createTest.test('create new connection and set properties', test => {
      let settings = { url: 'ws://test.com', pingInterval: 5000, requestTimeout: 15000 }
      let conn = KmsConnection.create(settings)

      test.equal(conn._url, settings.url)
      test.equal(conn._pingInterval, settings.pingInterval)
      test.equal(conn._timeout, settings.requestTimeout)
      test.ok(Requests.create.calledWith(sandbox.match({
        timeout: settings.requestTimeout
      })))
      test.end()
    })

    createTest.test('use default property values', test => {
      let conn = KmsConnection.create()

      test.equal(conn._url, 'ws://localhost:8080/sidecar')
      test.equal(conn._pingInterval, 30000)
      test.equal(conn._timeout, 5000)
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
          test.equal(wsEmitter.listenerCount('message'), 1)
          test.notEqual(wsEmitter.listeners('error')[0].name.indexOf('_wsOnError'), -1)
          test.equal(wsEmitter.listenerCount('ping'), 1)
          test.equal(wsEmitter.listenerCount('pong'), 1)
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
      let requestStartStub = sandbox.stub()
      Requests.create.returns({ start: requestStartStub })

      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let sidecarId = 'sidecar1'
          let serviceName = 'TestSidecar'

          let registerMessageId = `register-${sidecarId}`
          uuidStub.onFirstCall().returns(registerMessageId)

          let registerRequest = { jsonrpc: '2.0', id: registerMessageId, method: 'register', params: { id: sidecarId, serviceName } }
          let registerResponse = { jsonrpc: '2.0', id: registerMessageId, result: { id: sidecarId, batchKey: 'batch-key', rowKey: 'row-key', challenge: 'challenge' } }

          const rowSignature = 'row-signature'
          const batchSignature = 'batch-signature'
          SymmetricCrypto.sign.returns(rowSignature)
          AsymmetricCrypto.sign.returns(batchSignature)

          let challengeMessageId = `challenge-${sidecarId}`
          uuidStub.onSecondCall().returns(challengeMessageId)

          let challengeRequest = { jsonrpc: '2.0', id: challengeMessageId, method: 'challenge', params: { rowSignature, batchSignature } }
          let challengeResponse = { jsonrpc: '2.0', id: challengeMessageId, result: { status: 'ok' } }

          requestStartStub.onFirstCall().callsArgWith(0, registerMessageId)
          requestStartStub.onFirstCall().returns(P.resolve(registerResponse))

          requestStartStub.onSecondCall().callsArgWith(0, challengeMessageId)
          requestStartStub.onSecondCall().returns(P.resolve(challengeResponse))

          let registerPromise = kmsConnection.register(sidecarId, serviceName)
          registerPromise
            .then(keys => {
              test.deepEqual(JSON.parse(wsEmitter.send.firstCall.args), registerRequest)
              test.deepEqual(JSON.parse(wsEmitter.send.secondCall.args), challengeRequest)

              test.ok(SymmetricCrypto.sign.calledWith(registerResponse.result.challenge, registerResponse.result.rowKey))
              test.ok(AsymmetricCrypto.sign.calledWith(registerResponse.result.challenge, registerResponse.result.batchKey))

              test.equal(keys.batchKey, registerResponse.result.batchKey)
              test.equal(keys.rowKey, registerResponse.result.rowKey)
              test.end()
            })
        })
    })

    registerTest.test('throw error if KMS sends error during registration', test => {
      let requestStartStub = sandbox.stub()
      Requests.create.returns({ start: requestStartStub })

      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let sidecarId = 'sidecar1'

          let registerMessageId = `register-${sidecarId}`
          uuidStub.returns(registerMessageId)

          let registerResponse = { jsonrpc: '2.0', id: registerMessageId, error: { id: 101, message: 'bad stuff' } }

          requestStartStub.onFirstCall().callsArgWith(0, registerMessageId)
          requestStartStub.onFirstCall().returns(P.resolve(registerResponse))

          let registerPromise = kmsConnection.register(sidecarId)
          registerPromise
            .then(() => {
              test.fail('Should have thrown error')
              test.end()
            })
            .catch(Errors.KmsResponseError, err => {
              test.ok(wsEmitter.send.calledOnce)
              test.equal(err.message, registerResponse.error.message)
              test.equal(err.errorId, registerResponse.error.id)
              test.end()
            })
        })
    })

    registerTest.test('throw error if KMS sends error during challenge', test => {
      let requestStartStub = sandbox.stub()
      Requests.create.returns({ start: requestStartStub })

      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let sidecarId = 'sidecar1'

          let registerMessageId = `register-${sidecarId}`
          uuidStub.onFirstCall().returns(registerMessageId)

          let registerResponse = { jsonrpc: '2.0', id: registerMessageId, result: { id: sidecarId, batchKey: 'batch-key', rowKey: 'row-key', challenge: 'challenge' } }

          let challengeMessageId = `challenge-${sidecarId}`
          uuidStub.onSecondCall().returns(challengeMessageId)

          let challengeResponse = { jsonrpc: '2.0', id: challengeMessageId, error: { id: 105, message: 'bad challenge' } }

          requestStartStub.onFirstCall().callsArgWith(0, registerMessageId)
          requestStartStub.onFirstCall().returns(P.resolve(registerResponse))

          requestStartStub.onSecondCall().callsArgWith(0, challengeMessageId)
          requestStartStub.onSecondCall().returns(P.resolve(challengeResponse))

          let registerPromise = kmsConnection.register(sidecarId)
          registerPromise
            .then(() => {
              test.fail('Should have thrown error')
              test.end()
            })
            .catch(Errors.KmsResponseError, err => {
              test.equal(err.message, challengeResponse.error.message)
              test.equal(err.errorId, challengeResponse.error.id)
              test.end()
            })
        })
    })

    registerTest.test('throw error if KMS returns invalid status during challenge', test => {
      let requestStartStub = sandbox.stub()
      Requests.create.returns({ start: requestStartStub })

      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let sidecarId = 'sidecar1'

          let registerMessageId = `register-${sidecarId}`
          uuidStub.onFirstCall().returns(registerMessageId)

          let registerResponse = { jsonrpc: '2.0', id: registerMessageId, result: { id: sidecarId, batchKey: 'batch-key', rowKey: 'row-key', challenge: 'challenge' } }

          let challengeMessageId = `challenge-${sidecarId}`
          uuidStub.onSecondCall().returns(challengeMessageId)

          let challengeResponse = { jsonrpc: '2.0', id: challengeMessageId, result: { status: 'nope' } }

          requestStartStub.onFirstCall().callsArgWith(0, registerMessageId)
          requestStartStub.onFirstCall().returns(P.resolve(registerResponse))

          requestStartStub.onSecondCall().callsArgWith(0, challengeMessageId)
          requestStartStub.onSecondCall().returns(P.resolve(challengeResponse))

          let registerPromise = kmsConnection.register(sidecarId)
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
    })

    registerTest.end()
  })

  kmsConnTest.test('request should', requestTest => {
    requestTest.test('send JSONRPC request and return pending promise', test => {
      let requestId = 'request'
      uuidStub.returns(requestId)

      let method = 'test'
      let params = { key: 'val' }
      let jsonRpcRequest = { jsonrpc: '2.0', id: requestId, method, params }

      let ws = { send: sandbox.stub() }

      let requestStartStub = sandbox.stub()
      Requests.create.returns({ start: requestStartStub })

      let conn = KmsConnection.create()
      conn._ws = ws

      let result = { test: 'test' }

      requestStartStub.onFirstCall().callsArgWith(0, requestId)
      requestStartStub.onFirstCall().returns(P.resolve({ result }))

      let requestPromise = conn.request(method, params)
      requestPromise
        .then(r => {
          test.equal(r, result)
          test.ok(ws.send.calledOnce)
          test.deepEqual(JSON.parse(ws.send.firstCall.args), jsonRpcRequest)

          test.end()
        })
    })

    requestTest.end()
  })

  kmsConnTest.test('respond should', sendResponseTest => {
    sendResponseTest.test('send JSONRPC response', test => {
      let id = 'id'
      let request = { id }
      let result = { key: 'val' }
      let jsonRpcResponse = { jsonrpc: '2.0', id, result }

      let ws = { send: sandbox.stub() }

      let conn = KmsConnection.create()
      conn._ws = ws

      conn.respond(request, result)
      test.ok(ws.send.calledOnce)
      test.deepEqual(JSON.parse(ws.send.firstCall.args), jsonRpcResponse)
      test.end()
    })

    sendResponseTest.end()
  })

  kmsConnTest.test('respondError should', sendErrorResponseTest => {
    sendErrorResponseTest.test('send JSONRPC error response', test => {
      let id = 'id'
      let request = { id }
      let error = { id: 101, message: 'error happened' }
      let jsonRpcErrorResponse = { jsonrpc: '2.0', id, error }

      let ws = { send: sandbox.stub() }

      let conn = KmsConnection.create()
      conn._ws = ws

      conn.respondError(request, error)
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
    messageEventTest.test('log warning if not JSONRPC message', test => {
      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let data = JSON.stringify({ id: 'id' })
          wsEmitter.emit('message', data)

          test.ok(Logger.warn.calledWith(`Invalid message format received from KMS: ${data}`))
          test.end()
        })
    })

    messageEventTest.test('emit healthCheck event for healthcheck request method', test => {
      let healthCheckSpy = sandbox.spy()

      let kmsConnection = KmsConnection.create()
      kmsConnection.on('healthCheck', healthCheckSpy)

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let healthCheck = { jsonrpc: '2.0', id: 'e1c609bd-e147-460b-ae61-98264bc935ad', method: 'healthcheck', params: { level: 'ping' } }
          wsEmitter.emit('message', JSON.stringify(healthCheck))

          test.ok(healthCheckSpy.calledWith(sandbox.match({
            id: healthCheck.id,
            level: healthCheck.params.level
          })))
          test.end()
        })
    })

    messageEventTest.test('log warning for unknown request method', test => {
      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let unknown = JSON.stringify({ jsonrpc: '2.0', id: 'e1c609bd-e147-460b-ae61-98264bc935ad', method: 'unknown', params: { test: 1 } })
          wsEmitter.emit('message', unknown)

          test.ok(Logger.warn.calledWith(`Unhandled request from KMS received: ${unknown}`))
          test.end()
        })
    })

    messageEventTest.test('complete pending request with matching response id', test => {
      let id = 'test'

      let requestCompleteStub = sandbox.stub()
      let requestExistsStub = sandbox.stub()
      Requests.create.returns({ complete: requestCompleteStub, exists: requestExistsStub })

      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      requestExistsStub.withArgs(id).returns(true)

      connectPromise
        .then(() => {
          let response = { jsonrpc: '2.0', id, result: { test: 1 } }
          wsEmitter.emit('message', JSON.stringify(response))

          test.ok(requestCompleteStub.calledOnce)
          test.ok(requestCompleteStub.calledWith(id, sandbox.match({
            result: response.result
          })))
          test.end()
        })
    })

    messageEventTest.test('log warning for unknown response id', test => {
      let id = 'test'

      let requestCompleteStub = sandbox.stub()
      let requestExistsStub = sandbox.stub()
      Requests.create.returns({ complete: requestCompleteStub, exists: requestExistsStub })

      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      requestExistsStub.withArgs(id).returns(false)

      connectPromise
        .then(() => {
          let response = { jsonrpc: '2.0', id: 'test2', result: { test: 1 } }
          wsEmitter.emit('message', JSON.stringify(response))

          test.notOk(requestCompleteStub.called)
          test.end()
        })
    })

    messageEventTest.end()
  })

  kmsConnTest.end()
})
