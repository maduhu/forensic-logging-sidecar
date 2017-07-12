'use strict'

const EventEmitter = require('events')

class BatchTracker extends EventEmitter {
  constructor (settings) {
    super()

    this._batchSize = settings.batchSize || 64
    this._unbatchedEvents = []
  }

  eventCreated (eventId) {
    this._unbatchedEvents.push(eventId)
    if (this._unbatchedEvents.length >= this._batchSize) {
      this.emit('batchReady', this._unbatchedEvents.splice(0, this._batchSize))
    }
  }
}

exports.create = (settings) => {
  return new BatchTracker(settings || {})
}
