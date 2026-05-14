const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY must be at least 32 characters');
}

module.exports = {
  encrypt(text) {
    if (!text) return null;
    return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY, {
      mode: CryptoJS.mode.GCM,
      padding: CryptoJS.pad.Pkcs7,
      iv: CryptoJS.lib.WordArray.random(16)
    }).toString();
  },

  decrypt(encryptedText) {
    if (!encryptedText) return null;
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY, {
        mode: CryptoJS.mode.GCM,
        padding: CryptoJS.pad.Pkcs7
      });
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (err) {
      console.error('Decryption failed:', err.message);
      return null;
    }
  },

  hashToken(token) {
    return CryptoJS.SHA256(token + ENCRYPTION_KEY).toString();
  }
};
