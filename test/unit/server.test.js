'use strict'

const src = '../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const P = require('bluebird')
const Logger = require('@leveloneproject/central-services-shared').Logger
const Db = require(`${src}/lib/db`)
const Config = require(`${src}/lib/config`)
const Migrator = require(`${src}/lib/migrator`)
const Sidecar = require(`${src}/sidecar`)
const Package = require('../../package')

Test('Server', serverTest => {
  let sandbox
  let oldPort
  let oldService
  let oldBatchSize
  let oldKmsConfig
  let oldDatabaseUri
  let port = 1234
  let batchSize = 5
  let service = 'MyService'
  let kmsConfig = { 'URL': 'ws://test.com', 'PING_INTERVAL': 10000, 'REQUEST_TIMEOUT': 15000 }
  let databaseUri = 'some-database-uri'

  serverTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Db, 'connect')
    sandbox.stub(Db, 'disconnect')
    sandbox.stub(Sidecar, 'create')
    sandbox.stub(Migrator, 'migrate')
    sandbox.stub(Logger)

    oldPort = Config.PORT
    oldKmsConfig = Config.KMS
    oldService = Config.SERVICE
    oldBatchSize = Config.BATCH_SIZE
    oldDatabaseUri = Config.DATABASE_URI

    Config.PORT = port
    Config.KMS = kmsConfig
    Config.SERVICE = service
    Config.BATCH_SIZE = batchSize
    Config.DATABASE_URI = databaseUri

    t.end()
  })

  serverTest.afterEach(t => {
    delete require.cache[require.resolve('../../src/server')]
    sandbox.restore()
    Config.BATCH_SIZE = oldBatchSize
    Config.KMS = oldKmsConfig
    Config.PORT = oldPort
    Config.SERVICE = oldService
    Config.DATABASE_URI = oldDatabaseUri
    t.end()
  })

  serverTest.test('setup should', setupTest => {
    setupTest.test('create sidecar and start it', test => {
      Db.connect.returns(P.resolve({}))
      Migrator.migrate.returns(P.resolve({}))

      let startStub = sandbox.stub()
      startStub.returns(P.resolve())

      let sidecar = { id: 'id', service: 'test-service', port: 1234, start: startStub }
      Sidecar.create.returns(sidecar)

      require('../../src/server')
      .then(() => {
        test.ok(Migrator.migrate.calledOnce)
        test.ok(Migrator.migrate.calledBefore(Db.connect))
        test.ok(Db.connect.calledOnce)
        test.ok(Db.connect.calledWith(databaseUri))
        test.ok(Sidecar.create.calledOnce)
        test.ok(Sidecar.create.calledWith(sandbox.match({
          port,
          serviceName: service,
          kmsUrl: kmsConfig.URL,
          kmsPingInterval: kmsConfig.PING_INTERVAL,
          kmsRequestTimeout: kmsConfig.REQUEST_TIMEOUT,
          version: Package.version,
          batchSize
        })))
        test.ok(startStub.calledOnce)
        test.ok(Logger.info.calledWith(`Sidecar ${sidecar.id} for ${sidecar.service} connected to KMS and listening for messages on port ${sidecar.port}`))
        test.end()
      })
    })

    setupTest.test('cleanup and rethrow on error', test => {
      let error = new Error()

      Db.connect.returns(P.resolve({}))
      Migrator.migrate.returns(P.resolve({}))

      let startStub = sandbox.stub()
      startStub.returns(P.reject(error))

      Sidecar.create.returns({ start: startStub })

      require('../../src/server')
      .then(() => {
        test.fail('Should have thrown error')
        test.end()
      })
      .catch(err => {
        test.ok(Logger.error.calledWith('Fatal error thrown by sidecar', error))
        test.ok(Db.disconnect.calledOnce)
        test.equal(err, error)
        test.end()
      })
    })

    setupTest.end()
  })

  serverTest.end()
})
