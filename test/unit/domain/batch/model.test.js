'use strict'

const src = '../../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const P = require('bluebird')
const Moment = require('moment')
const Db = require(`${src}/lib/db`)
const Model = require(`${src}/domain/batch/model`)

Test('Batches model', modelTest => {
  let sandbox

  modelTest.beforeEach((t) => {
    sandbox = Sinon.sandbox.create()

    Db.batches = {
      insert: sandbox.stub(),
      find: sandbox.stub()
    }

    t.end()
  })

  modelTest.afterEach((t) => {
    sandbox.restore()
    t.end()
  })

  modelTest.test('create should', createTest => {
    createTest.test('save payload and return new batch', test => {
      let payload = { batchId: 'event-id', sidecarId: 'sidecar-id', data: 'test data', signature: 'test' }
      let insertedBatch = { batchId: payload.batchId }

      Db.batches.insert.returns(P.resolve(insertedBatch))

      Model.create(payload)
        .then(s => {
          test.ok(Db.batches.insert.withArgs(payload).calledOnce)
          test.equal(s, insertedBatch)
          test.end()
        })
    })

    createTest.end()
  })

  modelTest.test('findForTimespan should', findForTimespanTest => {
    findForTimespanTest.test('find sidecar batches for a timespan', test => {
      let now = Moment.utc()
      let start = Moment.utc(now).subtract(5, 'minutes')

      let startTime = start.toISOString()
      let endTime = start.toISOString()

      let batches = [{ batchExternalId: '1' }, { batchExternalId: '2' }]
      Db.batches.find.returns(P.resolve(batches))

      Model.findForTimespan(startTime, endTime)
        .then(found => {
          test.equal(found, batches)
          test.ok(Db.batches.find.calledWith(sandbox.match({ 'created >=': startTime, 'created <=': endTime }), { order: 'created asc' }))
          test.end()
        })
    })

    findForTimespanTest.end()
  })

  modelTest.end()
})
