'use strict'

const src = '../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const P = require('bluebird')
const Moment = require('moment')
const EventEmitter = require('events')
const Logger = require('@leveloneproject/central-services-shared').Logger
const Proxyquire = require('proxyquire')
const KmsConnection = require(`${src}/kms`)
const HealthCheck = require(`${src}/health-check`)
const SocketListener = require(`${src}/socket`)
const EventService = require(`${src}/domain/event`)
const Package = require('../../package')

Test('Sidecar', sidecarTest => {
  let sandbox
  let sidecarId = 'id'
  let Sidecar

  sidecarTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Logger)
    sandbox.stub(Moment, 'utc')
    sandbox.stub(HealthCheck, 'ping')
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
      let now = new Date()
      Moment.utc.returns(now)

      let kmsOnStub = sandbox.stub()
      KmsConnection.create.returns({ 'on': kmsOnStub })

      let socketOnStub = sandbox.stub()
      SocketListener.create.returns({ 'on': socketOnStub })

      let settings = { SERVICE: 'test-service', KMS: { URL: 'ws://test.com' }, PORT: 1234 }
      let sidecar = Sidecar.create(settings)

      test.equal(sidecar.id, sidecarId)
      test.equal(sidecar.port, settings.PORT)
      test.equal(sidecar.service, settings.SERVICE)

      test.equal(sidecar.startTime, now)
      test.equal(sidecar.version, Package.version)

      test.equal(sidecar._sequence, 0)
      test.deepEqual(sidecar._unbatchedEvents, [])

      test.ok(KmsConnection.create.calledWith(settings.KMS))
      test.ok(kmsOnStub.calledWith('healthCheck'))
      test.ok(SocketListener.create.calledOnce)
      test.ok(socketOnStub.calledWith('message'))
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

      KmsConnection.create.returns({ connect: connectStub, register: registerStub, 'on': sandbox.stub() })

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

  sidecarTest.test('receving KMS healthCheck event should', healthCheckTest => {
    healthCheckTest.test('run healthcheck and send response to KMS if ping', test => {
      let connectStub = sandbox.stub()
      connectStub.returns(P.resolve())

      let keys = { batchKey: 'batch', rowKey: 'row' }
      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve(keys))

      let kmsConnection = new EventEmitter()
      kmsConnection.connect = connectStub
      kmsConnection.register = registerStub
      kmsConnection.sendResponse = sandbox.stub().returns(P.resolve())
      KmsConnection.create.returns(kmsConnection)

      SocketListener.create.returns({ 'on': sandbox.stub(), listen: sandbox.stub() })

      let healthCheck = {}
      let healthCheckPromise = P.resolve(healthCheck)
      HealthCheck.ping.returns(healthCheckPromise)

      let settings = { SERVICE: 'test-service', KMS: { URL: 'ws://test.com' }, PORT: 1234 }
      let sidecar = Sidecar.create(settings)

      let request = { id: 1, 'level': 'ping' }
      sidecar.start()
        .then(() => {
          kmsConnection.emit('healthCheck', request)

          healthCheckPromise
            .then(() => {
              test.ok(Logger.info.calledWith(`Received KMS health check request ${JSON.stringify(request)}`))
              test.ok(HealthCheck.ping.calledWith(sidecar))
              test.ok(kmsConnection.sendResponse.calledOnce)
              test.ok(kmsConnection.sendResponse.calledWith(request.id, healthCheck))
              test.end()
            })
        })
    })

    healthCheckTest.test('do not run healthcheck if healtcheck is not ping', test => {
      let connectStub = sandbox.stub()
      connectStub.returns(P.resolve())

      let keys = { batchKey: 'batch', rowKey: 'row' }
      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve(keys))

      let kmsConnection = new EventEmitter()
      kmsConnection.connect = connectStub
      kmsConnection.register = registerStub
      KmsConnection.create.returns(kmsConnection)

      SocketListener.create.returns({ 'on': sandbox.stub(), listen: sandbox.stub() })

      let settings = { SERVICE: 'test-service', KMS: { URL: 'ws://test.com' }, PORT: 1234 }
      let sidecar = Sidecar.create(settings)

      let request = { id: 1, 'level': 'details' }
      sidecar.start()
        .then(() => {
          kmsConnection.emit('healthCheck', request)
          test.ok(Logger.info.calledWith(`Received KMS health check request ${JSON.stringify(request)}`))
          test.notOk(HealthCheck.ping.called)
          test.end()
        })
    })

    healthCheckTest.end()
  })

  sidecarTest.test('receiving socket message event should', messageTest => {
    messageTest.test('increment sequence and save received message as an event', test => {
      let startSequence = 5

      let connectStub = sandbox.stub()
      connectStub.returns(P.resolve())

      let keys = { batchKey: 'batch', rowKey: 'row' }
      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve(keys))

      KmsConnection.create.returns({ connect: connectStub, register: registerStub, 'on': sandbox.stub() })

      let eventSocket = new EventEmitter()
      eventSocket.listen = sandbox.stub()
      SocketListener.create.returns(eventSocket)

      let event = { eventId: 'event-id', sequence: startSequence + 1 }
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
              test.ok(EventService.create.calledWith(sidecar.id, event.sequence, msg, keys.rowKey))
              test.equal(sidecar._unbatchedEvents.length, 1)
              test.deepEqual(sidecar._unbatchedEvents, [event.eventId])
              test.ok(Logger.info.calledWith(`Created event ${event.eventId} with sequence ${event.sequence}`))
              test.end()
            })
        })
    })

    messageTest.end()
  })

  sidecarTest.end()
})
