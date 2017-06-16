'use strict'

const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const EventEmitter = require('events').EventEmitter
const Logger = require('@leveloneproject/central-services-shared').Logger
const Proxyquire = require('proxyquire')

Test('KMS connection', kmsConnTest => {
  let sandbox
  let wsStub
  let KmsConnection

  kmsConnTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Logger)

    wsStub = sandbox.stub()
    KmsConnection = Proxyquire('../../../src/kms/connection', { 'ws': wsStub })

    t.end()
  })

  kmsConnTest.afterEach(t => {
    sandbox.restore()
    t.end()
  })

  kmsConnTest.test('create should', createTest => {
    createTest.test('create new connection and set properties', test => {
      let settings = { URL: 'ws://test.com' }
      let conn = KmsConnection.create(settings)

      test.equal(conn._url, settings.URL)
      test.end()
    })

    createTest.test('use default property values', test => {
      let conn = KmsConnection.create()

      test.equal(conn._url, 'ws://localhost:8080/sidecar')
      test.end()
    })

    createTest.end()
  })

  kmsConnTest.test('connect should', connectTest => {
    connectTest.test('create websocket connection and resolve when open', test => {
      let settings = { URL: 'ws://test.com' }
      let kmsConnection = KmsConnection.create(settings)

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      wsEmitter.emit('open')

      let connectPromise = kmsConnection.connect()
      test.ok(wsStub.calledWithNew())
      test.ok(wsStub.calledWith(settings.URL, sandbox.match({
        perMessageDeflate: false
      })))
      test.notOk(kmsConnection._connected)

      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          test.ok(kmsConnection._connected)
          test.equal(wsEmitter.listenerCount('open'), 1)
          test.equal(wsEmitter.listenerCount('close'), 1)
          test.equal(wsEmitter.listenerCount('error'), 1)
          test.equal(wsEmitter.listenerCount('message'), 0)
          test.end()
        })
    })

    connectTest.test('handle close event', test => {
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
          test.ok(Logger.info.calledWith(`onClose: ${code} - ${reason}`))
          test.end()
        })
    })

    connectTest.test('handle error event', test => {
      let kmsConnection = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      let connectPromise = kmsConnection.connect()
      wsEmitter.emit('open')

      connectPromise
        .then(() => {
          let err = new Error()
          wsEmitter.emit('error', err)
          test.ok(Logger.error.calledWith(err))
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

    registerTest.test('register with KMS and return keys', test => {
      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()

      let conn = KmsConnection.create()
      conn._connected = true
      conn._websocket = wsEmitter

      let sidecarId = 'sidecar1'
      let registerMessageId = `register-${sidecarId}`
      let registerRequest = { jsonrpc: '2.0', id: registerMessageId, method: 'register', params: { id: sidecarId, serviceName: 'test' } }
      let registerResponse = { jsonrpc: '2.0', id: registerMessageId, result: { id: sidecarId, batchKey: 'batchKey', rowKey: 'rowKey' } }

      let registerPromise = conn.register(sidecarId)

      let messageData = JSON.stringify(registerResponse)
      wsEmitter.emit('message', messageData)

      registerPromise
        .then(keys => {
          test.ok(Logger.info.calledWith(`Received message during registration procees: ${messageData}`))
          test.ok(wsEmitter.send.calledWith(JSON.stringify(registerRequest)))
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
      conn._websocket = wsEmitter

      let sidecarId = 'sidecar1'
      let registerResponse = { jsonrpc: '2.0', id: 'non-register', result: { id: sidecarId, batchKey: 'batchKey', rowKey: 'rowKey' } }

      let registerPromise = conn.register(sidecarId)

      let messageData = JSON.stringify(registerResponse)
      wsEmitter.emit('message', messageData)

      registerPromise
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(err => {
          test.ok(Logger.error.calledWith(`Received non-register message from KMS during registration process: ${messageData}`))
          test.equal(err.message, 'Error during KMS registration process')
          test.end()
        })
    })

    registerTest.test('throw error if a register message for a different sidecar received', test => {
      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()

      let conn = KmsConnection.create()
      conn._connected = true
      conn._websocket = wsEmitter

      let sidecarId = 'sidecar1'
      let registerMessageId = `register-${sidecarId}`
      let registerResponse = { jsonrpc: '2.0', id: registerMessageId, result: { id: 'sidecar2', batchKey: 'batchKey', rowKey: 'rowKey' } }

      let registerPromise = conn.register(sidecarId)

      let messageData = JSON.stringify(registerResponse)
      wsEmitter.emit('message', messageData)

      registerPromise
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(err => {
          test.ok(Logger.error.calledWith(`Received register message for different sidecar from KMS during registration process: ${messageData}`))
          test.equal(err.message, 'Error during KMS registration process')
          test.end()
        })
    })

    registerTest.test('switch message handling back to default handler after done registering', test => {
      let wsEmitter = new EventEmitter()
      wsEmitter.send = sandbox.stub()

      let conn = KmsConnection.create()
      conn._connected = true
      conn._websocket = wsEmitter

      let sidecarId = 'sidecar1'
      let registerMessageId = `register-${sidecarId}`
      let registerResponse = { jsonrpc: '2.0', id: registerMessageId, result: { id: sidecarId, batchKey: 'batchKey', rowKey: 'rowKey' } }

      let registerPromise = conn.register(sidecarId)

      let messageData = JSON.stringify(registerResponse)
      wsEmitter.emit('message', messageData)

      registerPromise
        .then(keys => {
          test.ok(Logger.info.calledWith(`Received message during registration procees: ${messageData}`))
          test.notOk(Logger.info.calledWith(`onMessage: ${messageData}`))

          let messageData2 = 'new message'
          wsEmitter.emit('message', messageData2)

          test.ok(Logger.info.calledWith(`onMessage: ${messageData2}`))
          test.notOk(Logger.info.calledWith(`Received message during registration procees: ${messageData2}`))

          test.end()
        })
    })

    registerTest.end()
  })

  kmsConnTest.end()
})
