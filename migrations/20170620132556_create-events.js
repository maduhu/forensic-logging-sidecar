'use strict'

exports.up = function(knex, Promise) {
  return knex.schema.createTableIfNotExists('events', (t) => {
    t.uuid('eventId').primary()
    t.uuid('sidecarId').notNullable()
    t.integer('sequence').notNullable()
    t.text('message', 'longtext').notNullable()
    t.string('signature', 128)
    t.timestamp('created').notNullable()
  })
}

exports.down = function(knex, Promise) {
  return knex.schema.dropTableIfExists('events')
}
