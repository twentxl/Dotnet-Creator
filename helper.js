function isProbablyGitUrl(url) {
    const u = String(url || '').trim()
    if (!u) return false
  
    if (/^(https?|ssh):\/\/[^\s]+$/i.test(u)) return true
    if (/^[\w.-]+@[\w.-]+:[\w./-]+(\.git)?$/i.test(u)) return true
  
    return false
  }
  
  function getRepoNameFromUrl(url) {
    const cleaned = String(url || '').trim().replace(/\/+$/, '')
    const last = cleaned.split(/[\/:]/).pop() || 'repo'
    return last.replace(/\.git$/i, '') || 'repo'
  }
  
  function shQuote(arg) {
    const s = String(arg ?? '')
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  
  module.exports = {
    isProbablyGitUrl,
    getRepoNameFromUrl,
    shQuote
  }