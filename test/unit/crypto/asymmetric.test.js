'use strict'

const src = '../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const TweetNacl = require('tweetnacl')
const TweetNaclUtil = require('tweetnacl-util')
const CryptoUtil = require(`${src}/crypto/util`)
const Asymmetric = require(`${src}/crypto/asymmetric`)

Test('Asymmetric crypto', asymmetricTest => {
  let sandbox

  asymmetricTest.beforeEach((t) => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(TweetNacl)
    sandbox.stub(TweetNaclUtil, 'decodeUTF8')
    sandbox.stub(CryptoUtil, 'hexToBuffer')
    t.end()
  })

  asymmetricTest.afterEach((t) => {
    sandbox.restore()
    t.end()
  })

  asymmetricTest.test('sign should', signTest => {
    signTest.test('create ED25519 signature', test => {
      let privateKey = '107746ae1300174f7049e5988d0301dd76e57713d82b125df4161fc7be88bb780224bdab8a182a57793a465176b8ffd0546c5f171e3115185a57e95bc0ba5279'
      let privateKeyBuffer = Buffer.from(privateKey, 'hex')

      let message = 'test message'
      let messageBuffer = Buffer.from(message, 'utf8')

      CryptoUtil.hexToBuffer.returns(privateKeyBuffer)
      TweetNaclUtil.decodeUTF8.returns(messageBuffer)

      let signature = 'signature'
      TweetNacl.sign.returns(signature)

      let s = Asymmetric.sign(message, privateKey)
      test.ok(CryptoUtil.hexToBuffer.calledWith(privateKey))
      test.ok(TweetNacl.sign.calledWith(messageBuffer, privateKeyBuffer))
      test.equal(s, signature)

      test.end()
    })
    signTest.end()
  })

  asymmetricTest.end()
})
