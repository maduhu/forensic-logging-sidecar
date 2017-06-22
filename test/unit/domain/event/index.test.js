'use strict'

const src = '../../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const P = require('bluebird')
const Uuid = require('uuid4')
const Moment = require('moment')
const Proxyquire = require('proxyquire')
const Model = require(`${src}/domain/event/model`)
const SymmetricCrypto = require(`${src}/crypto/symmetric`)

Test('Events service', serviceTest => {
  let sandbox
  let eventId
  let Service

  serviceTest.beforeEach((t) => {
    sandbox = Sinon.sandbox.create()
    sandbox.stub(Model, 'create')
    sandbox.stub(Moment, 'utc')
    sandbox.stub(SymmetricCrypto, 'sign')

    eventId = Uuid()

    Service = Proxyquire(`${src}/domain/event`, { 'uuid4': () => eventId })

    t.end()
  })

  serviceTest.afterEach((t) => {
    sandbox.restore()
    t.end()
  })

  serviceTest.test('create should', createTest => {
    createTest.test('create signature and persist to model', test => {
      let sidecarId = Uuid()
      let sequence = 1
      let message = 'test message'
      let signingKey = 'DFDE22A3276FC520A24FBE5534EDADFE080D78375C4530E038EFCF6CA699228A'
      let now = Moment()

      let savedEvent = {}
      Model.create.returns(P.resolve(savedEvent))

      let signature = 'signature'
      SymmetricCrypto.sign.returns(signature)

      Moment.utc.returns(now)

      let compactJSON = `{"sidecarId":"${sidecarId}","sequence":${sequence},"message":"${message}","timestamp":"${now.toISOString()}"}`

      Service.create(sidecarId, sequence, message, signingKey)
        .then(s => {
          test.ok(SymmetricCrypto.sign.calledWith(signingKey, compactJSON))
          test.ok(Model.create.calledWith(sandbox.match({
            eventId,
            sidecarId,
            sequence,
            message,
            signature,
            created: now
          })))
          test.equal(s, savedEvent)
          test.end()
        })
    })

    createTest.end()
  })

  serviceTest.end()
})
