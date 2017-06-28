'use strict'

exports.hexToBuffer = (key) => {
  return Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex')
}
