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
    connectTest.test('create websocket connection and attach listeners', test => {
      let settings = { URL: 'ws://test.com' }
      let conn = KmsConnection.create(settings)

      let onSpy = sandbox.spy()
      wsStub.returns({ on: onSpy })

      conn.connect()
        .then(() => {
          test.ok(wsStub.calledWithNew())
          test.ok(wsStub.calledWith(settings.URL, sandbox.match({
            perMessageDeflate: false
          })))

          test.equal(onSpy.callCount, 4)
          test.ok(onSpy.calledWith('open'))
          test.ok(onSpy.calledWith('close'))
          test.ok(onSpy.calledWith('message'))
          test.ok(onSpy.calledWith('error'))
          test.end()
        })
    })

    connectTest.test('handle open event', test => {
      let conn = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      conn.connect()
        .then(() => {
          wsEmitter.emit('open')
          test.ok(Logger.info.calledWith('onOpen'))
          test.end()
        })
    })

    connectTest.test('handle close event', test => {
      let conn = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      conn.connect()
        .then(() => {
          let code = 100
          let reason = 'reason'
          wsEmitter.emit('close', code, reason)
          test.ok(Logger.info.calledWith(`onClose: ${code} - ${reason}`))
          test.end()
        })
    })

    connectTest.test('handle message event', test => {
      let conn = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      conn.connect()
        .then(() => {
          let obj = { id: 'id' }
          let message = JSON.stringify(obj)
          wsEmitter.emit('message', message)
          test.ok(Logger.info.calledWith(`onMessage: ${obj}`))
          test.end()
        })
    })

    connectTest.test('handle error event', test => {
      let conn = KmsConnection.create()

      let wsEmitter = new EventEmitter()
      wsStub.returns(wsEmitter)

      conn.connect()
        .then(() => {
          let err = new Error()
          wsEmitter.emit('error', err)
          test.ok(Logger.error.calledWith(err))
          test.end()
        })
    })

    connectTest.end()
  })

  kmsConnTest.test('register should', registerTest => {
    registerTest.test('log sidecar id', test => {
      let conn = KmsConnection.create()

      let sidecarId = 'id'
      conn.register(sidecarId)

      test.ok(Logger.info.calledWith(sidecarId))
      test.end()
    })

    registerTest.end()
  })

  kmsConnTest.end()
})
