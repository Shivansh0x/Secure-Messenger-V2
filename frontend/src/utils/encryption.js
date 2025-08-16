import CryptoJS from "crypto-js";

function toWordArray(maybeKey) {
  // WordArray duck-typing
  if (maybeKey && typeof maybeKey === "object" &&
      Array.isArray(maybeKey.words) && typeof maybeKey.sigBytes === "number") {
    return maybeKey;
  }
  if (typeof maybeKey === "string") {
    try {
      return CryptoJS.enc.Base64.parse(maybeKey);
    } catch (_) {
      return CryptoJS.enc.Utf8.parse(maybeKey);
    }
  }
  throw new Error("encryptWithAES: key must be a CryptoJS WordArray or a base64/utf8 string");
}

export function encryptWithAES(plaintext, key) {
  const keyWA = toWordArray(key);
  const iv = CryptoJS.lib.WordArray.random(16);

  const enc = CryptoJS.AES.encrypt(plaintext, keyWA, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    ciphertext: enc.ciphertext.toString(CryptoJS.enc.Base64),
    iv: iv.toString(CryptoJS.enc.Base64),
  };
}
