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

Test('server test', serverTest => {
  let sandbox
  let oldService
  let oldKmsConfig
  let oldDatabaseUri
  let service = 'MyService'
  let kmsConfig = { 'URL': 'ws://test.com' }
  let databaseUri = 'some-database-uri'

  serverTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Db, 'connect')
    sandbox.stub(Sidecar, 'create')
    sandbox.stub(Migrator, 'migrate')
    sandbox.stub(Logger)

    oldKmsConfig = Config.KMS
    oldService = Config.SERVICE
    oldDatabaseUri = Config.DATABASE_URI

    Config.KMS = kmsConfig
    Config.SERVICE = service
    Config.DATABASE_URI = databaseUri

    t.end()
  })

  serverTest.afterEach(t => {
    delete require.cache[require.resolve('../../src/server')]
    sandbox.restore()
    Config.KMS = oldKmsConfig
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

      Sidecar.create.returns({ start: startStub })

      require('../../src/server')
      .then(() => {
        test.ok(Migrator.migrate.calledOnce)
        test.ok(Migrator.migrate.calledBefore(Db.connect))
        test.ok(Db.connect.calledOnce)
        test.ok(Db.connect.calledWith(databaseUri))
        test.ok(Sidecar.create.calledOnce)
        test.ok(Sidecar.create.calledWith(sandbox.match({
          SERVICE: service,
          KMS: kmsConfig
        })))
        test.ok(startStub.calledOnce)
        test.ok(Logger.info.calledWith('Sidecar running and listening'))
        test.end()
      })
    })

    setupTest.test('log error and rethrow', test => {
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
        test.ok(Logger.error.calledWith(error))
        test.equal(err, error)
        test.end()
      })
    })

    setupTest.end()
  })

  serverTest.end()
})
