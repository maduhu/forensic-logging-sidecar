'use strict'

const src = '../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const P = require('bluebird')
const EventEmitter = require('events')
const Proxyquire = require('proxyquire')
const KmsConnection = require(`${src}/kms`)
const SocketListener = require(`${src}/socket`)
const EventService = require(`${src}/domain/event`)

Test('Sidecar', sidecarTest => {
  let sandbox
  let sidecarId = 'id'
  let Sidecar

  sidecarTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(KmsConnection, 'create')
    sandbox.stub(SocketListener, 'create')
    sandbox.stub(EventService, 'create')

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
      SocketListener.create.returns({ 'on': onStub })

      let settings = { SERVICE: 'test-service', KMS: { URL: 'ws://test.com' }, PORT: 1234 }
      let sidecar = Sidecar.create(settings)

      test.equal(sidecar._id, sidecarId)
      test.equal(sidecar._port, settings.PORT)
      test.equal(sidecar._service, settings.SERVICE)
      test.ok(KmsConnection.create.calledOnce)
      test.ok(KmsConnection.create.calledWith(settings.KMS))
      test.ok(SocketListener.create.calledOnce)
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
      SocketListener.create.returns({ 'on': sandbox.stub(), listen: listenStub })

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
    messageTest.test('increment sequence and save received message as an event', test => {
      let startSequence = 5

      let connectStub = sandbox.stub()
      connectStub.returns(P.resolve())

      let keys = { batchKey: 'batch', rowKey: 'row' }
      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve(keys))

      KmsConnection.create.returns({ connect: connectStub, register: registerStub })

      let eventSocket = new EventEmitter()
      eventSocket.listen = sandbox.stub()
      SocketListener.create.returns(eventSocket)

      let event = { eventId: 'event-id' }
      let eventPromise = P.resolve(event)
      EventService.create.returns(eventPromise)

      let settings = { SERVICE: 'test-service', KMS: { URL: 'ws://test.com' }, PORT: 1234 }
      let sidecar = Sidecar.create(settings)
      sidecar._sequence = startSequence

      test.equal(sidecar._unbatchedEvents.length, 0)

      let msg = JSON.stringify({ id: 1, name: 'test' })
      sidecar.start()
        .then(() => {
          eventSocket.emit('message', msg)

          eventPromise
            .then(() => {
              test.ok(EventService.create.calledWith(sidecar._id, startSequence + 1, msg, keys.rowKey))
              test.equal(sidecar._unbatchedEvents.length, 1)
              test.deepEqual(sidecar._unbatchedEvents, [event.eventId])
              test.end()
            })
        })
    })
    messageTest.end()
  })

  sidecarTest.end()
})
