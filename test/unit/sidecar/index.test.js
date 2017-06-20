'use strict'

const src = '../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const P = require('bluebird')
const EventEmitter = require('events')
const Proxyquire = require('proxyquire')
const Logger = require('@leveloneproject/central-services-shared').Logger
const KmsConnection = require(`${src}/kms/connection`)
const EventListener = require(`${src}/sidecar/event-listener`)

Test('sidecar test', sidecarTest => {
  let sandbox
  let sidecarId = 'id'
  let Sidecar

  sidecarTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Logger)
    sandbox.stub(KmsConnection, 'create')
    sandbox.stub(EventListener, 'create')

    Sidecar = Proxyquire(`${src}/sidecar`, { 'uuid4': () => sidecarId })

    t.end()
  })

  sidecarTest.afterEach(t => {
    sandbox.restore()
    t.end()
  })

  sidecarTest.test('create should', createTest => {
    createTest.test('create new sidecar and setup', test => {
      KmsConnection.create.returns({})

      let onStub = sandbox.stub()
      EventListener.create.returns({ 'on': onStub })

      let settings = { SERVICE: 'test-service', KMS: { URL: 'ws://test.com' }, PORT: 1234 }
      let sidecar = Sidecar.create(settings)

      test.equal(sidecar._id, sidecarId)
      test.equal(sidecar._port, settings.PORT)
      test.equal(sidecar._service, settings.SERVICE)
      test.ok(KmsConnection.create.calledOnce)
      test.ok(KmsConnection.create.calledWith(settings.KMS))
      test.ok(EventListener.create.calledOnce)
      test.ok(onStub.calledWith('message'))
      test.end()
    })

    createTest.end()
  })

  sidecarTest.test('start should', startTest => {
    startTest.test('connect to KMS and register then start EventSocket listening', test => {
      let connectStub = sandbox.stub()
      connectStub.returns(P.resolve())

      let keys = { batchKey: 'batch', rowKey: 'row' }
      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve(keys))

      KmsConnection.create.returns({ connect: connectStub, register: registerStub })

      let listenStub = sandbox.stub()
      EventListener.create.returns({ 'on': sandbox.stub(), listen: listenStub })

      let settings = { SERVICE: 'test-service', KMS: { URL: 'ws://test.com' }, PORT: 1234 }
      let sidecar = Sidecar.create(settings)

      sidecar.start()
        .then(() => {
          test.ok(connectStub.calledOnce)
          test.ok(registerStub.calledOnce)
          test.ok(registerStub.calledWith(sidecarId, settings.SERVICE))
          test.equal(sidecar._rowKey, keys.rowKey)
          test.equal(sidecar._batchKey, keys.batchKey)
          test.ok(listenStub.calledWith(settings.PORT))
          test.end()
        })
    })

    startTest.end()
  })

  sidecarTest.test('receiving message event should', messageTest => {
    messageTest.test('log received message', test => {
      let connectStub = sandbox.stub()
      connectStub.returns(P.resolve())

      let keys = { batchKey: 'batch', rowKey: 'row' }
      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve(keys))

      KmsConnection.create.returns({ connect: connectStub, register: registerStub })

      let eventSocket = new EventEmitter()
      eventSocket.listen = sandbox.stub()
      EventListener.create.returns(eventSocket)

      let settings = { SERVICE: 'test-service', KMS: { URL: 'ws://test.com' }, PORT: 1234 }
      let sidecar = Sidecar.create(settings)

      let msg = JSON.stringify({ id: 1, name: 'test' })
      sidecar.start()
        .then(() => {
          eventSocket.emit('message', msg)
          test.ok(Logger.info.calledWith(`Received message ${msg}`))
          test.end()
        })
    })
    messageTest.end()
  })

  sidecarTest.end()
})
