module.exports = function chunkString(str, length) {
  return str.match(new RegExp('.{1,' + length + '}', 'g'));
}