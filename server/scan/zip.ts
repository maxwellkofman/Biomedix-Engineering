/**
 * Minimal ZIP reader for .docx and .xlsx uploads. Reads the central directory,
 * inflates only the entries asked for, and caps every entry's unpacked size so a
 * crafted file can't exhaust memory.
 */
import { inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export class ZipError extends Error {}

export function unzip(buf: Buffer, want: (name: string) => boolean, { maxEntry = 40 * 1024 * 1024, maxTotal = 120 * 1024 * 1024 } = {}) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('Not a valid ZIP container.');
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (p === 0xffffffff) throw new ZipError('ZIP64 files are not supported.');
  const out = new Map<string, Buffer>();
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL) throw new ZipError('Damaged ZIP directory.');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    if (flags & 1) throw new ZipError('The file is password-protected.');
    if (size > maxEntry || (total += size) > maxTotal) throw new ZipError('The file unpacks to more than we can read automatically.');
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOCAL) throw new ZipError('Damaged ZIP entry.');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compSize);
    if (method === 0) out.set(name, Buffer.from(raw));
    else if (method === 8) out.set(name, inflateRawSync(raw, { maxOutputLength: maxEntry }));
    else throw new ZipError(`Unsupported ZIP compression (${method}).`);
  }
  return out;
}
