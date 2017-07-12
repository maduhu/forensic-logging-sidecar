'use strict'

const Db = require('../../lib/db')

exports.create = (batch) => {
  return Db.batches.insert(batch)
}
