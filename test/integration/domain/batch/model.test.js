'use strict'

const Test = require('tape')
const Uuid = require('uuid4')
const Moment = require('moment')
const Model = require('../../../../src/domain/batch/model')

Test('batches model', modelTest => {
  modelTest.test('create should', createTest => {
    createTest.test('create a new batch', test => {
      const created = Moment.utc()
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

  modelTest.end()
})
