import CryptoJS from "crypto-js";

export function encryptWithAES(plaintext, key) {
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(plaintext, key, { iv });
  return {
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    iv: iv.toString(CryptoJS.enc.Base64),
  };
}

export function decryptWithAES(ciphertext, key, iv) {
  try {
    const ivWordArray = CryptoJS.enc.Base64.parse(iv);
    const encryptedData = CryptoJS.enc.Base64.parse(ciphertext);
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: encryptedData,
    });
    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, { iv: ivWordArray });
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error("Decryption failed", err);
    return null;
  }
}
