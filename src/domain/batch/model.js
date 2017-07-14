'use strict'

const Db = require('../../lib/db')

exports.create = (batch) => {
  return Db.batches.insert(batch)
}

exports.findForTimespan = (startTime, endTime) => {
  return Db.batches.find({ 'created >=': startTime, 'created <=': endTime }, { order: 'created asc' })
}
