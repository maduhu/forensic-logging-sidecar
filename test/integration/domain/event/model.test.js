'use strict'

const Test = require('tape')
const Uuid = require('uuid4')
const Moment = require('moment')
const Model = require('../../../../src/domain/event/model')

Test('events model', repoTest => {
  repoTest.test('create should', createTest => {
    createTest.test('create a new event', test => {
      const created = Moment.utc()
      const event = { eventId: Uuid(), sidecarId: Uuid(), sequence: 1, message: 'test message', signature: 'test-signature', created }

      Model.create(event)
        .then(saved => {
          test.equal(saved.eventId, event.eventId)
          test.equal(saved.sidecarId, event.sidecarId)
          test.equal(saved.sequence, event.sequence)
          test.equal(saved.message, event.message)
          test.equal(saved.signature, event.signature)
          test.equal(saved.created.toISOString(), created.toISOString())
          test.end()
        })
    })

    createTest.test('not allow duplicate sequence for a given sidecar', test => {
      const created = new Date()

      const event = { eventId: Uuid(), sidecarId: Uuid(), sequence: 2, message: 'test message', signature: 'test-signature', created }
      const event2 = { eventId: Uuid(), sidecarId: event.sidecarId, sequence: 2, message: 'another message', signature: 'diff-signature', created }

      Model.create(event)
        .then((saved) => {
          test.ok(saved)
          return Model.create(event2)
        })
        .then(() => {
          test.fail('Should have thrown error')
        })
        .catch(err => {
          test.ok(err)
          test.end()
        })
    })

    createTest.end()
  })

  repoTest.end()
})
