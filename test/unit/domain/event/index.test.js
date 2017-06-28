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
    sandbox.stub(Model, 'getEventCount')
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
          test.ok(SymmetricCrypto.sign.calledWith(compactJSON, signingKey))
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

  serviceTest.test('getEventCountInTimespan should', getEventCountTest => {
    getEventCountTest.test('get event count from model', test => {
      let now = Moment()
      let start = Moment(now).subtract(5, 'minutes')
      let sidecarId = 'sidecar-id'
      let count = 6

      Model.getEventCount.returns(P.resolve(count))

      Service.getEventCountInTimespan(sidecarId, start, now)
        .then(c => {
          test.equal(c, count)
          test.ok(Model.getEventCount.calledWith(sidecarId, sandbox.match({ startTime: start, endTime: now })))
          test.end()
        })
    })

    getEventCountTest.end()
  })

  serviceTest.end()
})
