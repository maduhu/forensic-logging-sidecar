'use strict'

const src = '../../../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const P = require('bluebird')
const Db = require(`${src}/lib/db`)
const Model = require(`${src}/domain/batch/model`)

Test('Batches model', modelTest => {
  let sandbox

  modelTest.beforeEach((t) => {
    sandbox = Sinon.sandbox.create()

    Db.batches = {
      insert: sandbox.stub()
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

  modelTest.end()
})
