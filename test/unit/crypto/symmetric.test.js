'use strict'

const src = '../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const Proxyquire = require('proxyquire')

Test('symmetric crypto', symmetricTest => {
  let sandbox
  let aesCmacStub
  let Symmetric

  symmetricTest.beforeEach((t) => {
    sandbox = Sinon.sandbox.create()

    aesCmacStub = sandbox.stub()

    Symmetric = Proxyquire(`${src}/crypto/symmetric`, { 'node-aes-cmac': { aesCmac: aesCmacStub } })

    t.end()
  })

  symmetricTest.afterEach((t) => {
    sandbox.restore()
    t.end()
  })

  symmetricTest.test('sign should', createTest => {
    createTest.test('convert hex encoded signing key and create AES CMAC signature', test => {
      let message = 'test message'
      let signingKey = 'DFDE22A3276FC520A24FBE5534EDADFE080D78375C4530E038EFCF6CA699228A'
      let signingKeyBuffer = Buffer.from(signingKey, 'hex')

      let signature = 'signature'
      aesCmacStub.returns(signature)

      let s = Symmetric.sign(signingKey, message)
      test.ok(aesCmacStub.calledWith(signingKeyBuffer, message))
      test.equal(s, signature)
      test.end()
    })

    createTest.end()
  })

  symmetricTest.end()
})
