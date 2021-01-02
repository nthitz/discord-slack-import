module.exports = function chunkString(str, chunkSize) {
  const chunks = []
  for (let pos = 0; pos < str.length; pos += chunkSize) {
    chunks.push(str.slice(pos, pos + chunkSize))
  }
  return chunks
}