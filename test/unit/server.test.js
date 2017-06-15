'use strict'

const src = '../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const P = require('bluebird')
const Logger = require('@leveloneproject/central-services-shared').Logger
const Config = require(`${src}/lib/config`)
const KmsConnection = require(`${src}/kms/connection`)

Test('server test', serverTest => {
  let sandbox
  let oldKmsConfig
  let kmsConfig = { 'URL': 'ws://test.com' }

  serverTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(KmsConnection, 'create')
    sandbox.stub(Logger, 'error')

    oldKmsConfig = Config.KMS
    Config.KMS = kmsConfig

    t.end()
  })

  serverTest.afterEach(t => {
    delete require.cache[require.resolve('../../src/server')]
    sandbox.restore()
    Config.KMS = oldKmsConfig
    t.end()
  })

  serverTest.test('setup should', setupTest => {
    setupTest.test('run all actions', test => {
      let connectStub = sandbox.stub()
      connectStub.returns(P.resolve())

      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve())

      KmsConnection.create.returns({ connect: connectStub, register: registerStub })

      require('../../src/server')
      .then(() => {
        test.ok(KmsConnection.create.calledOnce)
        test.ok(KmsConnection.create.calledWith(kmsConfig))
        test.ok(connectStub.calledOnce)
        test.ok(registerStub.calledOnce)
        test.end()
      })
    })

    setupTest.test('log error on start', test => {
      let error = new Error()

      let connectStub = sandbox.stub()
      connectStub.returns(P.reject(error))
      KmsConnection.create.returns({ connect: connectStub })

      require('../../src/server')
      .then(() => {
        test.fail('Expected exception to be thrown')
        test.end()
      })
      .catch(e => {
        test.equal(e, error)
        test.ok(Logger.error.calledWith(error))
        test.end()
      })
    })
    setupTest.end()
  })

  serverTest.end()
})
