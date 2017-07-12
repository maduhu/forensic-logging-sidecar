'use strict'

const src = '../../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const Uuid = require('uuid4')
const BatchTracker = require(`${src}/domain/batch/tracker`)

Test('BatchTracker', trackerTest => {
  let sandbox

  trackerTest.beforeEach((t) => {
    sandbox = Sinon.sandbox.create()
    t.end()
  })

  trackerTest.afterEach((t) => {
    sandbox.restore()
    t.end()
  })

  trackerTest.test('create should', createTest => {
    createTest.test('create new batch tracker and setup', test => {
      let settings = { batchSize: 50 }
      let tracker = BatchTracker.create(settings)

      test.equal(tracker._batchSize, settings.batchSize)
      test.deepEqual(tracker._unbatchedEvents, [])
      test.end()
    })

    createTest.test('use default settings', test => {
      let tracker = BatchTracker.create()

      test.equal(tracker._batchSize, 64)
      test.end()
    })

    createTest.end()
  })

  trackerTest.test('eventCreated should', eventTest => {
    eventTest.test('add event to list', test => {
      let tracker = BatchTracker.create()

      let eventId = Uuid()

      tracker.eventCreated(eventId)

      test.equal(tracker._unbatchedEvents.length, 1)
      test.deepEqual(tracker._unbatchedEvents, [eventId])
      test.end()
    })

    eventTest.test('emit batchReady event if unbatched length equal to batch size', test => {
      let eventId1 = Uuid()
      let eventId2 = Uuid()
      let batchSize = 2
      let batchReadySpy = sandbox.spy()

      let tracker = BatchTracker.create({ batchSize })
      tracker.on('batchReady', batchReadySpy)

      tracker.eventCreated(eventId1)
      test.notOk(batchReadySpy.called)

      tracker.eventCreated(eventId2)
      test.ok(batchReadySpy.calledWith(sandbox.match([eventId1, eventId2])))
      test.equal(tracker._unbatchedEvents.length, 0)

      test.end()
    })

    eventTest.test('emit batchReady event if unbatched length greater than batch size', test => {
      let eventId1 = Uuid()
      let eventId2 = Uuid()
      let eventId3 = Uuid()
      let batchSize = 2
      let batchReadySpy = sandbox.spy()

      let tracker = BatchTracker.create({ batchSize })
      tracker._unbatchedEvents.push(eventId1)
      tracker._unbatchedEvents.push(eventId2)
      tracker.on('batchReady', batchReadySpy)

      tracker.eventCreated(eventId3)
      test.ok(batchReadySpy.calledWith(sandbox.match([eventId1, eventId2])))
      test.equal(tracker._unbatchedEvents.length, 1)

      test.end()
    })

    eventTest.end()
  })

  trackerTest.end()
})
