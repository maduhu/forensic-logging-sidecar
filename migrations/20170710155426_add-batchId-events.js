'use strict'

exports.up = function (knex, Promise) {
  return knex.schema.table('events', (t) => {
    t.integer('batchId').nullable()
    t.foreign('batchId').references('batches.batchId')
    t.index('batchId')
  })
}

exports.down = function (knex, Promise) {
  return knex.schema.table('events', (t) => {
    t.dropIndex('batchId')
    t.dropForeign('batchId')
    t.dropColumn('batchId')
  })
}
