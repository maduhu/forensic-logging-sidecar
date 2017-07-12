'use strict'

exports.up = function(knex, Promise) {
  return knex.schema.createTableIfNotExists('batches', (t) => {
    t.increments('batchId').primary()
    t.uuid('batchExternalId').notNullable()
    t.uuid('sidecarId').notNullable()
    t.text('data', 'longtext').notNullable()
    t.string('signature', 128)
    t.timestamp('created').notNullable()
  })
}

exports.down = function(knex, Promise) {
  return knex.schema.dropTableIfExists('batches')
}
