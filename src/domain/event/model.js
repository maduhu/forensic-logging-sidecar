'use strict'

const Db = require('../../lib/db')

exports.create = (event) => {
  return Db.events.insert(event)
}

exports.getEventCount = (sidecarId, { startTime = null, endTime = null } = {}) => {
  let criteria = { sidecarId }

  if (startTime) {
    criteria['created >='] = startTime
  }
  if (endTime) {
    criteria['created <='] = endTime
  }

  return Db.events.count(criteria, '*')
}
