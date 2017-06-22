'use strict'

const src = '../../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const P = require('bluebird')
const Db = require(`${src}/lib/db`)
const Model = require(`${src}/domain/event/model`)

Test('Events model', modelTest => {
  let sandbox

  modelTest.beforeEach((t) => {
    sandbox = Sinon.sandbox.create()

    Db.events = {
      insert: sandbox.stub(),
      update: sandbox.stub(),
      findOne: sandbox.stub(),
      find: sandbox.stub()
    }

    t.end()
  })

  modelTest.afterEach((t) => {
    sandbox.restore()
    t.end()
  })

  modelTest.test('create should', createTest => {
    createTest.test('save payload and return new event', test => {
      let payload = { eventId: 'event-id', sidecarId: 'sidecar-id', sequence: 1, message: 'test message', signature: 'test' }
      let insertedEvent = { eventId: payload.eventId }

      Db.events.insert.returns(P.resolve(insertedEvent))

      Model.create(payload)
        .then(s => {
          test.ok(Db.events.insert.withArgs(payload).calledOnce)
          test.equal(s, insertedEvent)
          test.end()
        })
    })

    createTest.end()
  })

  modelTest.end()
})
