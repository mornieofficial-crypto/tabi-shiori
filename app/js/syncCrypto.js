// 同期用の暗号。共有リンクの「#」以降にだけ鍵が入り、サーバーには送られない。
// サーバーが受け取るのは、鍵から作った「部屋の名前」「書き込み用の合言葉」と、暗号化された内容だけ。
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = {
  from(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  to(str) {
    const pad = '='.repeat((4 - (str.length % 4)) % 4);
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

// 32バイト(256ビット)の乱数 = 43文字
export const newKey = () => b64u.from(crypto.getRandomValues(new Uint8Array(32)));
export const isKey = (k) => typeof k === 'string' && /^[A-Za-z0-9_-]{43}$/.test(k);

const sha256 = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

// 鍵から、用途ごとに別の値を作る(同じ鍵でも、部屋の名前から鍵は逆算できない)
export async function deriveKeys(key) {
  if (!isKey(key)) throw new Error('bad key');
  return {
    room: hex(await sha256('tabi:room:' + key)).slice(0, 32),
    token: b64u.from(await sha256('tabi:write:' + key)),
    aes: await crypto.subtle.importKey('raw', await sha256('tabi:enc:' + key), 'AES-GCM', false, ['encrypt', 'decrypt']),
  };
}

export async function encryptJson(obj, aes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(obj))));
  return `v1.${b64u.from(iv)}.${b64u.from(ct)}`;
}

export async function decryptJson(text, aes) {
  const [v, ivS, ctS] = String(text).split('.');
  if (v !== 'v1' || !ivS || !ctS) throw new Error('bad payload');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.to(ivS) }, aes, b64u.to(ctS));
  return JSON.parse(dec.decode(plain));
}
