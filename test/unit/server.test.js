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
    sandbox.stub(Logger)

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

      let keys = { batchKey: 'batch', rowKey: 'row' }
      let registerStub = sandbox.stub()
      registerStub.returns(P.resolve(keys))

      KmsConnection.create.returns({ connect: connectStub, register: registerStub })

      require('../../src/server')
      .then(() => {
        test.ok(KmsConnection.create.calledOnce)
        test.ok(KmsConnection.create.calledWith(kmsConfig))
        test.ok(connectStub.calledOnce)
        test.ok(registerStub.calledOnce)
        test.ok(Logger.info.calledWith(`Got keys from KMS: batch - ${keys.batchKey}, row - ${keys.rowKey}`))
        test.end()
      })
    })

    setupTest.end()
  })

  serverTest.end()
})
