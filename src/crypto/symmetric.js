'use strict'

const AesCmac = require('node-aes-cmac').aesCmac

exports.sign = (signingKey, message) => {
  return AesCmac(Buffer.from(signingKey, 'hex'), message)
}
