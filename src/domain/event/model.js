'use strict'

const Db = require('../../lib/db')

exports.create = (event) => {
  return Db.events.insert(event)
}
