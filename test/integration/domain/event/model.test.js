'use strict'

const Test = require('tape')
const P = require('bluebird')
const Uuid = require('uuid4')
const Moment = require('moment')
const Model = require('../../../../src/domain/event/model')
const BatchModel = require('../../../../src/domain/batch/model')

Test('events model', modelTest => {
  modelTest.test('create should', createTest => {
    createTest.test('create a new event', test => {
      const created = Moment.utc()
      const event = { sidecarId: Uuid(), sequence: 1, message: 'test message', signature: 'test-signature', created }

      Model.create(event)
        .then(saved => {
          test.ok(saved.eventId)
          test.equal(saved.sidecarId, event.sidecarId)
          test.equal(saved.sequence, event.sequence)
          test.equal(saved.message, event.message)
          test.equal(saved.signature, event.signature)
          test.equal(saved.created.toISOString(), created.toISOString())
          test.end()
        })
    })

    createTest.test('not allow duplicate sequence for a given sidecar', test => {
      const created = Moment.utc()

      const event = { sidecarId: Uuid(), sequence: 2, message: 'test message', signature: 'test-signature', created }
      const event2 = { sidecarId: event.sidecarId, sequence: 2, message: 'another message', signature: 'diff-signature', created }

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

  modelTest.test('getUnbatchedEvents should', getUnbatchedEventsTest => {
    getUnbatchedEventsTest.test('get events with no batch id for list of event ids and order by eventId', test => {
      const created = Moment.utc()

      const sidecarId = Uuid()
      const sidecarId2 = Uuid()

      const event = { sidecarId, sequence: 1, message: 'test message', signature: 'test-signature', created }
      const event2 = { sidecarId, sequence: 2, message: 'test message', signature: 'test-signature', created }
      const event3 = { sidecarId: sidecarId2, sequence: 1, message: 'another message', signature: 'diff-signature', created }
      const event4 = { sidecarId: sidecarId2, sequence: 2, message: 'another message', signature: 'diff-signature', created }

      P.all([Model.create(event), Model.create(event2), Model.create(event3), Model.create(event4)])
        .then(createdEvents => {
          let sortedEvents = createdEvents.sort((a, b) => {
            return a.eventId - b.eventId
          })

          let batch = { sidecarId, batchExternalId: Uuid(), data: '', signature: '', created }
          BatchModel.create(batch)
            .then(createdBatch => Model.updateEvents([sortedEvents[2].eventId, sortedEvents[3].eventId], { batchId: createdBatch.batchId }))
            .then(() => {
              Model.getUnbatchedEvents(createdEvents.map(x => x.eventId))
                .then(found => {
                  test.equal(found.length, 2)
                  test.equal(found[0].eventId, sortedEvents[0].eventId)
                  test.equal(found[1].eventId, sortedEvents[1].eventId)
                  test.notOk(found[0].batchId)
                  test.notOk(found[1].batchId)
                  test.end()
                })
            })
        })
    })

    getUnbatchedEventsTest.end()
  })

  modelTest.test('getEventCount should', getEventCountTest => {
    getEventCountTest.test('get events for sidecar', test => {
      const now = Moment.utc()

      const event = { sidecarId: Uuid(), sequence: 1, message: 'test message', signature: 'test-signature', created: Moment.utc(now).subtract(5, 'minutes') }
      const event2 = { sidecarId: event.sidecarId, sequence: 2, message: 'another message', signature: 'diff-signature', created: Moment.utc(now).subtract(45, 'minutes') }
      const event3 = { sidecarId: event.sidecarId, sequence: 3, message: 'another message', signature: 'diff-signature', created: Moment.utc(now).subtract(2, 'hours') }

      Model.create(event)
        .then(() => Model.create(event2))
        .then(() => Model.create(event3))
        .then(() => Model.getEventCount(event.sidecarId))
        .then(count => {
          test.equal(count, 3)
          test.end()
        })
    })

    getEventCountTest.test('get number of sidecar events in timespan', test => {
      const now = Moment.utc()
      const lastHour = Moment.utc(now).subtract(1, 'hour')

      const event = { sidecarId: Uuid(), sequence: 1, message: 'test message', signature: 'test-signature', created: Moment.utc(now).subtract(5, 'minutes') }
      const event2 = { sidecarId: event.sidecarId, sequence: 2, message: 'another message', signature: 'diff-signature', created: Moment.utc(now).subtract(45, 'minutes') }
      const event3 = { sidecarId: event.sidecarId, sequence: 3, message: 'another message', signature: 'diff-signature', created: Moment.utc(now).subtract(2, 'hours') }

      Model.create(event)
        .then(() => Model.create(event2))
        .then(() => Model.create(event3))
        .then(() => Model.getEventCount(event.sidecarId, { startTime: lastHour.toISOString(), endTime: now.toISOString() }))
        .then(count => {
          test.equal(count, 2)
          test.end()
        })
    })

    getEventCountTest.end()
  })

  modelTest.test('updateEvents should', updateEventsTest => {
    updateEventsTest.test('update batch id multiple events', test => {
      const created = Moment.utc()

      const sidecarId = Uuid()

      const event = { sidecarId, sequence: 1, message: 'test message', signature: 'test-signature', created }
      const event2 = { sidecarId, sequence: 2, message: 'test message', signature: 'test-signature', created }
      const event3 = { sidecarId, sequence: 3, message: 'another message', signature: 'diff-signature', created }

      P.all([Model.create(event), Model.create(event2), Model.create(event3)])
        .then(createdEvents => {
          let batch = { sidecarId, batchExternalId: Uuid(), data: '', signature: '', created }
          BatchModel.create(batch)
            .then(createdBatch => {
              Model.updateEvents(createdEvents.map(x => x.eventId), { batchId: createdBatch.batchId })
                .then(updated => {
                  test.equal(updated.length, 3)
                  test.ok(updated[0].batchId, createdBatch.batchId)
                  test.ok(updated[1].batchId, createdBatch.batchId)
                  test.ok(updated[2].batchId, createdBatch.batchId)
                  test.end()
                })
            })
        })
    })

    updateEventsTest.end()
  })

  modelTest.end()
})
