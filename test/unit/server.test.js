'use strict'

const src = '../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const P = require('bluebird')
const Logger = require('@leveloneproject/central-services-shared').Logger
const Config = require(`${src}/lib/config`)
const Sidecar = require(`${src}/sidecar`)

Test('server test', serverTest => {
  let sandbox
  let oldService
  let oldKmsConfig
  let service = 'MyService'
  let kmsConfig = { 'URL': 'ws://test.com' }

  serverTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Sidecar, 'create')
    sandbox.stub(Logger)

    oldKmsConfig = Config.KMS
    oldService = Config.SERVICE

    Config.KMS = kmsConfig
    Config.SERVICE = service

    t.end()
  })

  serverTest.afterEach(t => {
    delete require.cache[require.resolve('../../src/server')]
    sandbox.restore()
    Config.KMS = oldKmsConfig
    Config.SERVICE = oldService
    t.end()
  })

  serverTest.test('setup should', setupTest => {
    setupTest.test('create sidecar and start it', test => {
      let startStub = sandbox.stub()
      startStub.returns(P.resolve())

      Sidecar.create.returns({ start: startStub })

      require('../../src/server')
      .then(() => {
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
