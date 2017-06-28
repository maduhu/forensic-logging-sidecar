'use strict'

const Uuid = require('uuid4')
const Moment = require('moment')
const Model = require('./model')
const SymmetricCrypto = require('../../crypto/symmetric')

exports.create = (sidecarId, sequence, message, signingKey) => {
  const eventId = Uuid()
  const timestamp = Moment.utc()

  const signature = signEvent(sidecarId, sequence, message, timestamp, signingKey)
  return Model.create({ eventId, sidecarId, sequence, message, signature, created: timestamp })
}

exports.getEventCountInTimespan = (sidecarId, startTime, endTime) => {
  return Model.getEventCount(sidecarId, { startTime, endTime })
}

const signEvent = (sidecarId, sequence, message, timestamp, signingKey) => {
  const signingObject = { sidecarId, sequence, message, timestamp: timestamp.toISOString() }
  const compactJSON = JSON.stringify(signingObject)
  return SymmetricCrypto.sign(compactJSON, signingKey)
}
