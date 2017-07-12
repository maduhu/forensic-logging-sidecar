'use strict'

const Uuid = require('uuid4')
const Moment = require('moment')
const Model = require('./model')
const EventService = require('../event')
const AsymmetricCrypto = require('../../crypto/asymmetric')

exports.create = (sidecarId, eventIds, signingKey) => {
  return EventService.getUnbatchedEventsByIds(eventIds)
    .then(unbatchedEvents => {
      const batchExternalId = Uuid()
      const created = Moment.utc()

      const batchData = buildBatchData(unbatchedEvents)
      const signature = AsymmetricCrypto.sign(batchData, signingKey)

      return Model.create({ batchExternalId, sidecarId, data: batchData, signature, created })
        .then(batch => EventService.assignEventsToBatch(unbatchedEvents, batch).return(batch))
    })
}

const buildBatchData = (events) => {
  let batchData = events.map(e => {
    return {
      row: EventService.getSignableEvent(e),
      signature: e.signature
    }
  })
  return JSON.stringify(batchData)
}
