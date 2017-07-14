'use strict'

const Test = require('tape')
const Uuid = require('uuid4')
const Moment = require('moment')
const Model = require('../../../../src/domain/batch/model')

Test('batches model', modelTest => {
  modelTest.test('create should', createTest => {
    createTest.test('create a new batch', test => {
      const created = Moment.utc().subtract(1, 'year')
      const batch = { batchExternalId: Uuid(), sidecarId: Uuid(), data: 'test data', signature: 'test-signature', created }

      Model.create(batch)
        .then(saved => {
          test.ok(saved.batchId)
          test.equal(saved.batchExternalId, batch.batchExternalId)
          test.equal(saved.sidecarId, batch.sidecarId)
          test.equal(saved.data, batch.data)
          test.equal(saved.signature, batch.signature)
          test.equal(saved.created.toISOString(), created.toISOString())
          test.end()
        })
    })

    createTest.end()
  })

  modelTest.test('findForTimespan should', findForTimespanTest => {
    findForTimespanTest.test('find batches in timespan and order by created asc', test => {
      const now = Moment.utc()
      const lastHour = Moment.utc(now).subtract(1, 'hour')

      const batch = { batchExternalId: Uuid(), sidecarId: Uuid(), data: 'test data', signature: 'test-signature', created: Moment.utc(now).subtract(5, 'minutes') }
      const batch2 = { batchExternalId: Uuid(), sidecarId: batch.sidecarId, data: 'another data', signature: 'diff-signature', created: Moment.utc(now).subtract(45, 'minutes') }
      const batch3 = { batchExternalId: Uuid(), sidecarId: batch.sidecarId, data: 'other data', signature: 'diff-signature', created: Moment.utc(now).subtract(2, 'hours') }

      Model.create(batch)
        .then(() => Model.create(batch2))
        .then(() => Model.create(batch3))
        .then(() => Model.findForTimespan(lastHour.toISOString(), now.toISOString()))
        .then(found => {
          test.equal(found.length, 2)
          test.equal(found[0].batchExternalId, batch2.batchExternalId)
          test.equal(found[1].batchExternalId, batch.batchExternalId)
          test.end()
        })
    })

    findForTimespanTest.end()
  })

  modelTest.end()
})
