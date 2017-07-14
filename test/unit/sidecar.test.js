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
const BatchService = require(`${src}/domain/batch`)
const BatchTracker = require(`${src}/domain/batch/tracker`)

Test('Sidecar', sidecarTest => {
  let sandbox
  let uuidStub
  let Sidecar

  sidecarTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Logger)
    sandbox.stub(Moment, 'utc')
    sandbox.stub(HealthCheck, 'ping')
    sandbox.stub(BatchTracker, 'create')
    sandbox.stub(KmsConnection, 'create')
    sandbox.stub(SocketListener, 'create')
    sandbox.stub(EventService, 'create')
    sandbox.stub(BatchService, 'create')

    uuidStub = sandbox.stub()

    Sidecar = Proxyquire(`${src}/sidecar`, { 'uuid4': uuidStub })

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

      let sidecarId = 'sidecar-id'
      uuidStub.returns(sidecarId)

      let kmsOnStub = sandbox.stub()
      KmsConnection.create.returns({ 'on': kmsOnStub })

      let socketOnStub = sandbox.stub()
      SocketListener.create.returns({ 'on': socketOnStub })

      let batchTrackerOnStub = sandbox.stub()
      BatchTracker.create.returns({ 'on': batchTrackerOnStub })

      let settings = { serviceName: 'test-service', kmsUrl: 'ws://test.com', kmsPingInterval: 30000, kmsRequestTimeout: 15000, port: 1234, batchSize: 50, version: '1.2.3' }
      let sidecar = Sidecar.create(settings)

      test.equal(sidecar.id, sidecarId)
      test.equal(sidecar.port, settings.port)
      test.equal(sidecar.service, settings.serviceName)

      test.equal(sidecar.startTime, now)
      test.equal(sidecar.version, settings.version)

      test.equal(sidecar._sequence, 0)

      test.ok(KmsConnection.create.calledWith(sandbox.match({
        url: settings.kmsUrl,
        pingInterval: settings.kmsPingInterval,
        requestTimeout: settings.kmsRequestTimeout
      })))
      test.ok(kmsOnStub.calledWith('healthCheck'))
      test.ok(SocketListener.create.calledOnce)
      test.ok(socketOnStub.calledWith('message'))
      test.ok(BatchTracker.create.calledWith(sandbox.match({
        batchSize: settings.batchSize
      })))
      test.ok(batchTrackerOnStub.calledWith('batchReady'))
      test.end()
    })

    createTest.end()
  })

  sidecarTest.test('start should', startTest => {
    startTest.test('connect to KMS and register then start SocketListener listening', test => {
      let connectStub = sandbox.stub()
      connectStub.returns(P.resolve())

      let sidecarId = 'sidecar-id'
      uuidStub.returns(sidecarId)

      let keys = { batchKey: 'batch', rowKey: 'row' }
      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve(keys))

      KmsConnection.create.returns({ connect: connectStub, register: registerStub, 'on': sandbox.stub() })

      BatchTracker.create.returns({ 'on': sandbox.stub() })

      let listenStub = sandbox.stub()
      SocketListener.create.returns({ 'on': sandbox.stub(), listen: listenStub })

      let settings = { serviceName: 'test-service', kmsUrl: 'ws://test.com', kmsPingInterval: 30000, port: 1234, batchSize: 50, version: '1.2.3' }
      let sidecar = Sidecar.create(settings)

      sidecar.start()
        .then(() => {
          test.ok(connectStub.calledOnce)
          test.ok(registerStub.calledOnce)
          test.ok(registerStub.calledWith(sidecarId, settings.serviceName))
          test.equal(sidecar._rowKey, keys.rowKey)
          test.equal(sidecar._batchKey, keys.batchKey)
          test.ok(listenStub.calledWith(settings.port))
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
      kmsConnection.respond = sandbox.stub().returns(P.resolve())
      KmsConnection.create.returns(kmsConnection)

      SocketListener.create.returns({ 'on': sandbox.stub(), listen: sandbox.stub() })

      BatchTracker.create.returns({ 'on': sandbox.stub() })

      let healthCheck = {}
      let healthCheckPromise = P.resolve(healthCheck)
      HealthCheck.ping.returns(healthCheckPromise)

      let settings = { serviceName: 'test-service', kmsUrl: 'ws://test.com', kmsPingInterval: 30000, port: 1234, batchSize: 50, version: '1.2.3' }
      let sidecar = Sidecar.create(settings)

      let request = { id: 1, 'level': 'ping' }
      sidecar.start()
        .then(() => {
          kmsConnection.emit('healthCheck', request)

          healthCheckPromise
            .then(() => {
              test.ok(Logger.info.calledWith(`Received ${request.level} health check request ${request.id} from KMS`))
              test.ok(HealthCheck.ping.calledWith(sidecar))
              test.ok(Logger.info.calledWith(`Sending ping health check response ${request.id} to KMS`))
              test.ok(kmsConnection.respond.calledOnce)
              test.ok(kmsConnection.respond.calledWith(request, healthCheck))
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

      BatchTracker.create.returns({ 'on': sandbox.stub() })

      let settings = { serviceName: 'test-service', kmsUrl: 'ws://test.com', kmsPingInterval: 30000, port: 1234, batchSize: 50, version: '1.2.3' }
      let sidecar = Sidecar.create(settings)

      let request = { id: 1, 'level': 'details' }
      sidecar.start()
        .then(() => {
          kmsConnection.emit('healthCheck', request)
          test.ok(Logger.info.calledWith(`Received ${request.level} health check request ${request.id} from KMS`))
          test.notOk(HealthCheck.ping.called)
          test.end()
        })
    })

    healthCheckTest.end()
  })

  sidecarTest.test('receiving SocketListener message event should', messageTest => {
    messageTest.test('increment sequence and save received message as an event', test => {
      let startSequence = 5

      let connectStub = sandbox.stub()
      connectStub.returns(P.resolve())

      let keys = { batchKey: 'batch', rowKey: 'row' }
      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve(keys))

      KmsConnection.create.returns({ connect: connectStub, register: registerStub, 'on': sandbox.stub() })

      let eventCreatedStub = sandbox.stub()
      BatchTracker.create.returns({ eventCreated: eventCreatedStub, 'on': sandbox.stub() })

      let socketListener = new EventEmitter()
      socketListener.listen = sandbox.stub()
      SocketListener.create.returns(socketListener)

      let event = { eventId: 'event-id', sequence: startSequence + 1 }
      let eventPromise = P.resolve(event)
      EventService.create.returns(eventPromise)

      let settings = { serviceName: 'test-service', kmsUrl: 'ws://test.com', kmsPingInterval: 30000, port: 1234, batchSize: 50, version: '1.2.3' }
      let sidecar = Sidecar.create(settings)
      sidecar._sequence = startSequence

      let msg = JSON.stringify({ id: 1, name: 'test' })
      sidecar.start()
        .then(() => {
          socketListener.emit('message', msg)

          eventPromise
            .then(() => {
              test.ok(EventService.create.calledWith(sidecar.id, event.sequence, msg, keys.rowKey))
              test.ok(eventCreatedStub.calledOnce)
              test.ok(eventCreatedStub.calledWith(event.eventId))
              test.ok(Logger.info.calledWith(`Created event ${event.eventId} with sequence ${event.sequence}`))
              test.end()
            })
        })
    })

    messageTest.end()
  })

  sidecarTest.test('receiving BatchTracker batchReady event should', messageTest => {
    messageTest.test('create batch from received event ids and send to KMS', test => {
      let batchExternalId = 'event-id'
      let batchSignature = 'sig'

      let connectStub = sandbox.stub()
      connectStub.returns(P.resolve())

      let keys = { batchKey: 'batch', rowKey: 'row' }
      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve(keys))

      let kmsBatchResponse = { result: { id: batchExternalId } }
      let kmsBatchPromise = P.resolve(kmsBatchResponse)
      let requestStub = sandbox.stub().returns(kmsBatchPromise)

      KmsConnection.create.returns({ connect: connectStub, register: registerStub, request: requestStub, 'on': sandbox.stub() })

      SocketListener.create.returns({ 'on': sandbox.stub(), listen: sandbox.stub() })

      let batchTracker = new EventEmitter()
      batchTracker.event = sandbox.stub()
      BatchTracker.create.returns(batchTracker)

      let batchEventIds = [1, 2]

      let batch = { batchExternalId, signature: batchSignature }
      let batchPromise = P.resolve(batch)
      BatchService.create.returns(batchPromise)

      let settings = { serviceName: 'test-service', kmsUrl: 'ws://test.com', kmsPingInterval: 30000, port: 1234, batchSize: 50, version: '1.2.3' }
      let sidecar = Sidecar.create(settings)

      sidecar.start()
        .then(() => {
          batchTracker.emit('batchReady', batchEventIds)

          batchPromise
            .then(() => kmsBatchPromise)
            .then(() => {
              test.ok(BatchService.create.calledWith(sidecar.id, batchEventIds, keys.batchKey))
              test.ok(Logger.info.calledWith(`Created batch ${batch.batchExternalId} of ${batchEventIds.length} events`))
              test.ok(requestStub.calledWith('batch', sandbox.match({
                id: batchExternalId,
                signature: batchSignature
              })))
              test.ok(Logger.info.calledWith(`Sent batch ${kmsBatchResponse.id} successfully to KMS`))
              test.end()
            })
        })
    })

    messageTest.test('log error if thrown while sending batch to KMS', test => {
      let batchExternalId = 'event-id'
      let batchSignature = 'sig'

      let connectStub = sandbox.stub()
      connectStub.returns(P.resolve())

      let keys = { batchKey: 'batch', rowKey: 'row' }
      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve(keys))

      let err = new Error('error sending batch')
      let kmsBatchPromise = P.reject(err)
      let requestStub = sandbox.stub().returns(kmsBatchPromise)

      KmsConnection.create.returns({ connect: connectStub, register: registerStub, request: requestStub, 'on': sandbox.stub() })

      SocketListener.create.returns({ 'on': sandbox.stub(), listen: sandbox.stub() })

      let batchTracker = new EventEmitter()
      batchTracker.event = sandbox.stub()
      BatchTracker.create.returns(batchTracker)

      let batchEventIds = [1, 2]

      let batch = { batchExternalId, signature: batchSignature }
      let batchPromise = P.resolve(batch)
      BatchService.create.returns(batchPromise)

      let settings = { serviceName: 'test-service', kmsUrl: 'ws://test.com', kmsPingInterval: 30000, port: 1234, batchSize: 50, version: '1.2.3' }
      let sidecar = Sidecar.create(settings)

      sidecar.start()
        .then(() => {
          batchTracker.emit('batchReady', batchEventIds)

          batchPromise
            .then(() => kmsBatchPromise)
            .then(() => {
              test.fail('Should have thrown error')
              test.end()
            })
            .catch(e => {
              test.equal(e.message, err.message)
              test.ok(Logger.error.calledWith('Error received while creating batch and sending to KMS', e))
              test.end()
            })
        })
    })

    messageTest.end()
  })

  sidecarTest.end()
})
